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
// Code excerpts below are copied verbatim from the real solution.cpp — not
// reconstructed or paraphrased — so they match the actual repo line for line.
const HACKATHON_SQUAD_BODY = `
## The problem

Give every vertex in a graph a weight, then pick the highest-weight subset of
vertices such that no two chosen vertices share an edge. That's the
**Maximum Weight Independent Set (MWIS)** problem — and it's NP-hard
[Garey & Johnson, 1979], which means no algorithm is known to solve it
exactly on large graphs in a reasonable amount of time. The best you can do
is engineer a pipeline that gets as close to optimal as possible under a
hard budget. This solver had 290 seconds per instance, on graphs up to
200,000 vertices.

The pipeline follows the standard playbook for hard combinatorial
optimization under a real time limit: shrink the problem as much as
possible with provably-correct rules, solve what you can exactly, and spend
the remaining time on heuristic search for whatever's left.

:::gist PriyanshuIITGHY2006/56cd11848703208538c523e77d6c56bd
:::

## Phase 1 — Kernelization

Before any search begins, the solver applies a battery of **reduction
rules**, each provably safe — it either fixes a vertex's membership in the
optimal solution outright, or folds part of the graph into a smaller
equivalent piece, without ever losing the true optimum. The base rules
follow the **Buss–Goldsmith kernel** [Buss & Goldsmith, 1993] extended to
the weighted case, plus a dominance rule from **Akiba & Iwata's**
branch-and-reduce work [2016]:

- **Degree-0** — an isolated vertex has no conflicts, so it's always worth
  taking; include it and remove it.
- **Degree-1 (N-fold)** — a leaf \`v\` with sole neighbor \`u\`: if
  \`W[v] ≥ W[u]\`, just include \`v\`. Otherwise fold it away — the optimum
  equals \`W[v] + OPT(G')\` where \`G'\` drops \`v\` and reduces \`u\`'s weight
  by \`W[v]\`.
- **Degree-2 triangle / path** — if \`v\`'s two neighbors \`a, b\` are
  themselves adjacent, at most one of \`{v, a, b}\` can survive, so take the
  heaviest; if not adjacent and \`W[v] ≥ W[a] + W[b]\`, include \`v\` outright.
- **Dominance** — if a heavier neighbor \`u\`'s neighborhood is a superset of
  \`v\`'s, \`v\` can never do better than \`u\` and is discarded (checked only
  up to degree 12, where it's still cheap).

Here's the real degree-0/1/2 + dominance sweep from \`kernelize()\`:

:::gist PriyanshuIITGHY2006/fbb5e67c9aaf68117e44f8d863d45102
:::

Applied to a fixed point, these rules shrink the input graph down to a much
harder residual "core" that the rest of the pipeline actually has to fight
over.

## Phase 2 — LP relaxation via Nemhauser–Trotter

MWIS is equivalent to Vertex Cover under complementation, and Vertex
Cover's **linear-programming relaxation** has a special property: its
optimal solution is always **half-integral** — every variable settles at
exactly 0, 1, or ½. The **Nemhauser–Trotter theorem** [1975] goes further
and proves a *persistency* result: vertices that reach 0 or 1 in the LP
optimum are guaranteed to hold that same value in *some* integral optimum,
too. That means the LP relaxation alone can safely fix a chunk of the
solution without ever calling a combinatorial solver on those vertices —
only the ½-valued vertices need to be fought over exactly, and those form
the true hard "kernel."

This LP doesn't need a general-purpose LP solver — it reduces to
**max-flow**. Split every vertex \`v\` into a left copy \`v_L\` and a right
copy \`v_R\`, wire the source to every \`v_L\` and every \`v_R\` to the sink
with capacity \`W[v]\`, and add an infinite-capacity edge in both directions
for every edge \`(u, v)\` in the graph. A **minimum cut**, computed with
**Dinic's algorithm** [1970], reads off exactly the LP-optimal 0 / ½ / 1
assignment: \`v_L\` reachable in the residual graph and \`v_R\` not ⟶ LP says
1 (force in); \`v_R\` reachable and \`v_L\` not ⟶ LP says 0 (force out);
otherwise it's ½ and stays in the kernel.

This is the actual \`lp_reduce()\` function — the exact NT-reduction step
used in the solver, network construction and all:

:::gist PriyanshuIITGHY2006/7e60be22c496b813094fcff5c3c55543
:::

On real instances this alone reduces the graph by 90–99%; whatever survives
is the genuinely hard part.

## Phase 3 — Hybrid exact / heuristic solve

Whatever core remains after kernelization and LP fixing still has to be
solved, and the solver splits on structure.

**Tree components** are solved **exactly** in O(n) with a textbook DP —
there's no reason to guess when the shape guarantees a fast exact answer:

:::gist PriyanshuIITGHY2006/1014df39a34a25d4554f81c4485395bb
:::

**General-graph components** get **Iterated Local Search (ILS)**
[Lourenço et al., 2003], applied to MWIS the way Lamm et al.'s ReduMIS
[2016] does: greedy-build, local-search to convergence, then repeatedly
perturb and re-search, keeping the best solution seen. The local search
itself runs three passes to a fixed point — (1,2)-swaps, (2,3)-swaps, and
**PROBE** [Andrade, Resende & Werneck, 2012], the move that matters most.
PROBE is a **1→k swap**: for every vertex \`u\` outside the current set, if
\`u\`'s weight beats the combined weight of all its neighbors currently
*inside* the set, kick all of them out and put \`u\` in instead. It's the
generalization that plain (1,2)/(2,3)-swaps miss, and in practice gives the
largest gains on sparse graphs where ½-valued vertices have many
individually-light IS-neighbors:

:::gist PriyanshuIITGHY2006/4aad7f2eef792b6ca8b42ee4b0ec2c97
:::

When local search stalls (no improvement for 40+ iterations), ILS
**adaptively increases the perturbation rate** — capped at 35% of the
current solution removed per kick — to escape the local optimum, then
resets back to a gentle 10% the moment it finds something better.

Because a hackathon time budget is a hard wall clock, not a suggestion, the
solver installs \`SIGTERM\`/\`SIGINT\` handlers so the current best feasible
set gets unfolded and printed immediately if the process is about to be
killed:

:::gist PriyanshuIITGHY2006/ab2c3a689ef4f2209395385dbf054188
:::

The design is *anytime*: there's always a valid answer ready, and it only
gets better the longer the process is allowed to run — right up to an
internal 290-second cutoff, itself 20 seconds shy of the actual judge
deadline to guarantee clean output.

## Results

23 benchmark instances, spanning 18 vertices up to 200,000 vertices and
200,000 edges:

| Result | Count | Notes |
|---|---|---|
| **MATCH** expected | 13 | including dense/complete graphs, bipartite, cliques |
| **BETTER** than expected | 8 | trees, cycles, grids, and every large sparse case (20k–200k vertices) |
| **WORSE** than expected | 1 | \`02_small_sparse\` — dense random graph, an LP-hard kernel |
| **INVALID** | 0 | — |

The one weak case is worth stating plainly rather than glossing over: dense
random graphs produce a kernel where the LP relaxation can't fix much,
leaving ILS to search a large, awkward general-graph component under a
tight relative time budget — exactly the profile the literature flags as
hardest for this class of method [Gellner et al., 2021]. Every large
sparse real-world-shaped instance, by contrast, beat the expected value,
which is where kernelization does the most work.

## Further reading

The full research notes behind this solver — the wider algorithm landscape
considered (greedy variants, simulated annealing, tabu search, CHILS,
memetic algorithms), complexity analysis, and the complete bibliography —
are written up separately:

:::gist PriyanshuIITGHY2006/8c4aea7293ae5c51be762923b8ae9a65
:::
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
