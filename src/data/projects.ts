// ─── Detailed project write-ups (Projects page) ───────────────────────
// Longer-form explanations of each project, shown one after another on the
// #/projects page. Metrics mirror the résumé; the prose explains, in plain
// terms, what each project actually is and how it works.

export interface DetailedProject {
  id: string;
  title: string;
  date: string;
  stack: string[];
  github?: string;
  link?: { label: string; href: string };
  /** Gallery image id for a "Verify" deep-link (#/gallery?img=<id>). */
  verifyImg?: string;
  /** One-line "what it is". */
  verify?: string;
  tagline: string;
  /** Detailed understanding — rendered as paragraphs. */
  detail: string[];
  /** Headline results / key features. */
  highlights: string[];
  /**
   * Optional long-form deep-dive, rendered as markdown on its own page
   * (#/project?id=<id>) via the same pipeline as the blog — separate from
   * the blog itself, but reusable across any project that has one.
   */
  body?: string;
}

// Long-form deep-dive for the Hackathon-Squad project page (#/project?id=hackathon-squad).
// Kept out of the PROJECTS array literal just so the markdown block reads cleanly.
const HACKATHON_SQUAD_BODY = `
## The problem

Give every vertex in a graph a weight, then pick the highest-weight subset of
vertices such that no two chosen vertices share an edge. That's the
**Maximum Weight Independent Set (MWIS)** problem — and it's NP-hard, which
means no algorithm is known to solve it exactly on large graphs in a
reasonable amount of time. The best you can do is engineer a pipeline that
gets as close to optimal as possible under a hard budget. This solver had
290 seconds per instance.

The approach here follows the standard playbook for hard combinatorial
optimization under a real time limit: shrink the problem as much as
possible with provably-correct rules, solve what you can exactly, and spend
the remaining time on heuristic search for the rest.

## Phase 1 — Kernelization

Before any search begins, the solver applies a battery of **reduction
rules** that are safe by construction — each one either fixes a vertex's
membership in the optimal solution outright, or folds part of the graph
into a smaller equivalent piece, without ever losing the true optimum:

- **Degree-0 isolation** — an isolated vertex has no conflicts, so it's
  always worth taking; add it and remove it from further consideration.
- **Degree-1 folding** — a vertex with a single neighbor can be resolved
  by comparing weights and folding the pair into one reduced vertex.
- **Degree-2 triangle handling** — degree-2 vertices sitting inside a
  triangle admit a similar, slightly more involved folding.
- **Dominance checks** — if one vertex's neighborhood is a superset of
  another's for no greater weight, the dominated vertex can be discarded.
- **V-shape folding** — a small structural pattern that folds cleanly into
  a smaller instance.

Applied to a fixed point, these rules shrink the input graph down to a much
harder residual "core" — often a small fraction of the original size — that
the rest of the pipeline actually has to fight over.

## Phase 2 — LP relaxation via Nemhauser–Trotter

MWIS is equivalent to Vertex Cover under complementation, and Vertex
Cover's **linear-programming relaxation** has a special property: its
optimal solution is always **half-integral** — every variable settles at
exactly 0, 1, or ½. The **Nemhauser–Trotter theorem** goes further and
proves a *persistency* result: vertices that reach 0 or 1 in the LP optimum
are guaranteed to hold that same value in *some* integral optimum, too.
That means the LP relaxation alone can safely fix a chunk of the solution
without ever calling a combinatorial solver on those vertices — only the
½-valued vertices need to be fought over exactly.

The trick is that this particular LP doesn't need a general-purpose LP
solver at all — it can be computed with **max-flow**. Split every vertex
\`v\` into a left copy \`v_L\` and a right copy \`v_R\`, wire the source to
every \`v_L\` and every \`v_R\` to the sink with capacity equal to the
vertex's weight, and add an infinite-capacity edge \`u_R → v_L\` for every
edge \`(u, v)\` in the graph. A **minimum cut** in this network reads off
exactly the LP-optimal 0 / ½ / 1 assignment, and it can be computed
efficiently with **Dinic's algorithm** — here's a compact reference
implementation of that max-flow (the same core building block used in the
actual solver's LP-relaxation step):

\`\`\`cpp
// Dinic's algorithm — O(V^2 * E) max-flow, used to compute the
// Nemhauser-Trotter LP relaxation via the vertex-split min-cut construction
// described above.
struct Dinic {
    struct Edge { int to; long long cap; int rev; };
    vector<vector<Edge>> g;
    vector<int> level, it;

    Dinic(int n) : g(n), level(n), it(n) {}

    void addEdge(int from, int to, long long cap) {
        g[from].push_back({to, cap, (int)g[to].size()});
        g[to].push_back({from, 0, (int)g[from].size() - 1});
    }

    bool bfs(int s, int t) {
        fill(level.begin(), level.end(), -1);
        queue<int> q;
        level[s] = 0;
        q.push(s);
        while (!q.empty()) {
            int v = q.front(); q.pop();
            for (auto& e : g[v])
                if (e.cap > 0 && level[e.to] < 0) {
                    level[e.to] = level[v] + 1;
                    q.push(e.to);
                }
        }
        return level[t] >= 0;
    }

    long long dfs(int v, int t, long long f) {
        if (v == t) return f;
        for (int& i = it[v]; i < (int)g[v].size(); i++) {
            Edge& e = g[v][i];
            if (e.cap > 0 && level[v] < level[e.to]) {
                long long d = dfs(e.to, t, min(f, e.cap));
                if (d > 0) {
                    e.cap -= d;
                    g[e.to][e.rev].cap += d;
                    return d;
                }
            }
        }
        return 0;
    }

    long long maxflow(int s, int t) {
        long long flow = 0;
        while (bfs(s, t)) {
            fill(it.begin(), it.end(), 0);
            long long f;
            while ((f = dfs(s, t, LLONG_MAX)) > 0) flow += f;
        }
        return flow;
    }
};
\`\`\`

## Phase 3 — Hybrid exact / heuristic solve

Whatever core survives kernelization and LP fixing still has to be solved.
The solver splits on structure:

- **Tree components** get solved **exactly** with a textbook tree DP —
  there's no reason to guess when a component's shape guarantees a fast
  exact answer.
- **General-graph components** are handed to **Iterated Local Search
  (ILS)**, built around a move called **PROBE**: a 1→k swap that lets a
  single vertex outside the current set replace several of its neighbours
  inside it, whenever the weight gained beats the weight given up. Plain
  local search stalls in local optima quickly, so ILS adds **adaptive
  perturbation** — when the current solution stops improving, it kicks a
  controlled amount of randomness into the working set to jump to a new
  starting point and keeps searching from there.

Because a hackathon time budget is a hard wall clock, not a suggestion, the
solver installs **SIGTERM/SIGINT handlers** so that whatever the current
best feasible set is gets printed immediately if the process is about to be
killed — the design is *anytime*: it always has a valid answer ready, and
that answer only gets better the longer it's allowed to run.

## Results

Across the benchmark set, the pipeline produced **23 / 23 valid solutions**
with zero invalid outputs, **beat the expected value on 8 test cases**, and
never failed to return a feasible answer inside the 290-second limit — the
anytime design paying off exactly as intended.
`.trim();

export const PROJECTS: DetailedProject[] = [
  {
    id: "prag-dristi",
    title: "Prag-Dristi — Assam Flood Forecasting Engine",
    date: "Apr 2026 – Present",
    stack: ["Python", "PyTorch", "LSTM", "Bahdanau Attention", "FastAPI", "Streamlit"],
    github: "https://github.com/PriyanshuIITGHY2006/Prag-Dristi",
    tagline:
      "A deep-learning early-warning system that forecasts Brahmaputra river discharge up to seven days ahead, so floods in Assam can be anticipated before they hit.",
    detail: [
      "Assam floods almost every monsoon as the Brahmaputra swells, and the difference between a managed evacuation and a disaster is often just a few days of warning. Prag-Dristi is a forecasting engine that predicts how much water the river will carry over the next week, turning raw weather and hydrology data into an actionable flood signal.",
      "At its core is an <b>LSTM encoder–decoder</b> (a sequence-to-sequence neural network) fitted with <b>Bahdanau attention</b>. The encoder reads 23 years of historical ERA5 reanalysis and GloFAS discharge data; the attention mechanism then lets the decoder focus on the specific past days that matter most for each future day it predicts, instead of treating all history equally — which is exactly how a hydrologist reasons about upstream rainfall travelling downstream.",
      "Floods are rare events — under 8% of the record — so a naïve model just learns to predict 'no flood'. To fix this class imbalance, training uses a <b>flood-weighted MSE loss</b> that penalises missed high-discharge days far more heavily. The trained model is served through a FastAPI backend with a Streamlit dashboard for real-time monitoring.",
    ],
    highlights: [
      "NSE = 0.924 and KGE = 0.920 on unseen years (near-perfect hydrological skill scores)",
      "Probability of Detection (POD) = 0.651 for actual flood events",
      "7-day lead time on 23 years of ERA5 / GloFAS data",
    ],
  },
  {
    id: "memoryos",
    title: "MemoryOS — Persistent Memory for Stateless LLMs",
    date: "Feb 2026 – Present",
    stack: ["Python", "Neo4j", "ChromaDB", "FastAPI", "Groq LLaMA-3.3-70B"],
    github: "https://github.com/PriyanshuIITGHY2006/Memory-Os",
    tagline:
      "A memory framework that gives forgetful LLMs long-term recall, so an assistant remembers facts across thousands of turns without re-reading the whole conversation each time.",
    detail: [
      "Large language models are <b>stateless</b>: each request only knows what you put in its context window. The usual workaround — pasting the entire chat history back in every turn — gets slow and expensive fast, and eventually overflows the window entirely. MemoryOS solves this by giving the model an external memory it can write to and read from, the way an operating system manages RAM and disk.",
      "It uses a <b>three-tier memory system</b>: a <b>Neo4j knowledge graph</b> stores entities and the relationships between them (who, what, how things connect); a <b>ChromaDB vector store</b> holds embeddings for fuzzy semantic recall ('find me anything similar to this'); and an <b>active buffer</b> keeps the most recent turns immediately available. Automatic entity resolution stitches new information onto the right existing nodes instead of creating duplicates.",
      "On each turn, only the relevant slice of memory is retrieved and injected — so the prompt stays small and roughly constant in size no matter how long the conversation runs. The reasoning itself is driven by Groq-hosted LLaMA-3.3-70B.",
    ],
    highlights: [
      "Sustains 4,000+ conversational turns at a near-constant ≈350 tokens/turn",
      "99.8% token savings versus naïvely resending the full history",
      "Graph + vector + buffer hybrid with automatic entity resolution",
    ],
  },
  {
    id: "hackathon-squad",
    title: "Hackathon-Squad — Maximum Weight Independent Set Solver",
    date: "Apr 2026",
    stack: ["C++", "Parameterized Algorithms", "Max-Flow", "Local Search"],
    github: "https://github.com/PriyanshuIITGHY2006/Hackathon-Squad",
    verifyImg: "hackathon-squad",
    tagline:
      "A high-performance C++ solver for the NP-hard Maximum Weight Independent Set problem, built for a hackathon and engineered to return strong answers under a hard time limit.",
    detail: [
      "The <b>Maximum Weight Independent Set (MWIS)</b> problem asks: given a graph where every vertex carries a weight, pick a subset of vertices with the largest total weight such that no two chosen vertices are connected by an edge. It is <b>NP-hard</b>, so there is no known fast exact method for large graphs — the engineering challenge is squeezing out the best possible answer within a budget (here, a 290-second limit).",
      "The solver runs a <b>three-phase pipeline</b>. First, <b>kernelization</b> applies reduction rules — degree-0 isolation, degree-1 folding, degree-2 triangle handling, dominance checks and V-shape folding — to provably shrink the graph down to a hard 'core'. Second, an <b>LP relaxation via the Nemhauser–Trotter theorem</b>, computed with a <b>Dinic max-flow</b>, fixes parts of the optimal solution outright.",
      "Third, the remaining core is solved with a <b>hybrid strategy</b>: exact tree dynamic programming on tree-shaped components, and <b>Iterated Local Search (ILS)</b> with a PROBE local-search move (a 1→k swap that lets one vertex replace several of its neighbours) on general graphs, plus adaptive perturbation when the search stalls. Signal handlers (SIGTERM/SIGINT) guarantee a valid set is printed even if the clock runs out mid-search.",
    ],
    highlights: [
      "23 / 23 valid solutions across the benchmark set, zero invalid outputs",
      "Beat the expected value on 8 test cases",
      "Anytime design: always returns a feasible answer within the 290s limit",
    ],
    body: HACKATHON_SQUAD_BODY,
  },
  {
    id: "min-variance",
    title: "Minimum-Variance Portfolio Optimizer",
    date: "Dec 2025 – Present",
    stack: ["Python", "NumPy", "yfinance", "PyPortfolioOpt", "Modern Portfolio Theory"],
    github: "https://github.com/PriyanshuIITGHY2006/min-var-portfolio",
    tagline:
      "A quantitative pipeline that builds the lowest-risk long-only stock portfolio using Modern Portfolio Theory.",
    detail: [
      "In Modern Portfolio Theory, a portfolio's risk is its return <i>variance</i>, and the <b>minimum-variance portfolio</b> is the specific mix of assets that makes that variance as small as possible. This project automates the whole construction: it pulls historical prices via <b>yfinance</b>, estimates how the assets move together, and solves for the weights that minimise risk.",
      "The hard part is the <b>covariance matrix</b>. Estimated naïvely from a sample, it is noisy and often not even mathematically valid for optimisation, which produces unstable, garbage portfolios. The pipeline applies <b>Ledoit–Wolf shrinkage</b> to pull the estimate toward a stable target, and a <b>nearest-PSD correction</b> to force the matrix back to being positive semi-definite so the optimiser is well-posed.",
      "Finally it enforces realistic constraints — <b>no short selling</b> (weights stay non-negative) and full weight normalisation — so the output is an actually investable long-only portfolio rather than a theoretical one.",
    ],
    highlights: [
      "Ledoit–Wolf shrinkage + nearest-PSD correction for covariance stability",
      "No-short-selling constraints with normalised weights",
      "End-to-end: data fetch → estimation → optimisation",
    ],
  },
  {
    id: "kelly-criterion",
    title: "Kelly Criterion for Fixed-Limit Games",
    date: "Dec 2025 – Jan 2026",
    stack: ["Python", "Game Theory", "Stochastic Modeling"],
    link: { label: "LinkedIn", href: "https://www.linkedin.com/in/priyanshu-debnath-3a81711b3" },
    verify: "kelly-criterion",
    tagline:
      "A betting-strategy engine that adapts the Kelly criterion to games where you cannot bet an arbitrary fraction of your bankroll.",
    detail: [
      "The classic <b>Kelly criterion</b> tells a gambler the optimal fraction <i>f*</i> of their bankroll to wager on a favourable bet so that wealth grows fastest in the long run (it maximises expected logarithmic growth). It assumes you can stake any continuous fraction you like — but many real games have <b>fixed bet sizes</b>, which breaks the formula.",
      "This project derives a workaround it calls the <b>Stochastic Gate</b>: instead of changing <i>how much</i> you bet, it converts the optimal Kelly fraction <i>f*</i> into a <b>Kelly Frequency</b> — <i>how often</i> you should choose to play versus sit out. By modulating participation rather than stake size, it recovers Kelly-optimal behaviour under a hard bet-size constraint.",
      "A Python simulation engine validates this empirically, showing that the frequency-gated strategy tracks the optimal geometric growth curve that continuous Kelly would achieve.",
    ],
    highlights: [
      "Derives the 'Stochastic Gate': f* → an optimal play frequency",
      "Recovers Kelly-optimal growth under fixed bet sizes",
      "Simulation matches the ideal geometric growth curve",
    ],
  },
  {
    id: "cp-archive",
    title: "Automated Competitive Programming Archive",
    date: "Apr 2026 – Present",
    stack: ["Python", "Codeforces REST API", "Markdown Automation"],
    github: "https://github.com/PriyanshuIITGHY2006/codeforces-solutions",
    tagline:
      "A tool that automatically catalogues every Accepted Codeforces solution into a clean, browsable archive.",
    detail: [
      "Competitive programmers accumulate hundreds of solved problems, but those solutions usually rot in scattered files. This archiver talks to the <b>Codeforces REST API</b>, pulls down every Accepted C++ submission, and organises them into a structured, self-updating repository.",
      "From that data it auto-generates a Markdown README that indexes the problems <b>by difficulty rating</b> (from 800 up to 2400) and breaks down the <b>algorithmic tag distribution</b> — so the archive doubles as a personal analytics dashboard showing which topics and rating bands have been covered.",
    ],
    highlights: [
      "Indexes 250+ solved problems automatically",
      "Organised by rating band (800–2400) and algorithm tags",
      "Self-updating via the Codeforces API",
    ],
  },
];
