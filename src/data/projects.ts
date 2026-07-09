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
the remaining time on heuristic search for whatever's left. Here's the real
\`main()\` — the whole pipeline, top to bottom, exactly as it ships:

\`\`\`cpp
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    signal(SIGTERM, signal_handler);
    signal(SIGINT,  signal_handler);

    cin >> N >> M;
    for (int i = 1; i <= N; i++) cin >> W[i];
    for (int i = 0; i < M; i++) {
        int u, v; cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    // Sort adjacency lists for O(log d) has_edge()
    for (int i = 1; i <= N; i++) {
        sort(adj[i].begin(), adj[i].end());
        live_deg[i] = (int)adj[i].size();
    }

    memset(removed,   false, sizeof(removed));
    memset(forced_in, false, sizeof(forced_in));
    memset(in_sol,    false, sizeof(in_sol));
    memset(conf,      0,     sizeof(conf));
    cur_weight = 0;

    vector<int> kernel = kernelize();

    for (int v = 1; v <= N; v++) {
        if (forced_in[v]) {
            final_weight_global += W[v];
            final_sol_global.push_back(v);
        }
    }

    if (kernel.empty()) goto output;

    {
        auto components = get_components(kernel);

        sort(components.begin(), components.end(),
             [](const vector<int>& a, const vector<int>& b){ return a.size() < b.size(); });

        long long total_hard_nodes = 0;
        vector<bool> is_hard(components.size(), false);
        vector<pair<long long,vector<int>>> tree_results(components.size());

        for (int ci = 0; ci < (int)components.size(); ci++) {
            auto& comp = components[ci];
            long long sc = 0;
            vector<int> res;
            if (solve_as_tree(comp, res, sc)) {
                tree_results[ci] = {sc, res};
                is_hard[ci] = false;
            } else {
                is_hard[ci] = true;
                total_hard_nodes += comp.size();
            }
        }

        for (int ci = 0; ci < (int)components.size(); ci++) {
            if (!is_hard[ci]) {
                final_weight_global += tree_results[ci].first;
                for (int v : tree_results[ci].second) final_sol_global.push_back(v);
            }
        }

        double time_remaining = TIME_LIMIT - elapsed_sec();

        for (int ci = 0; ci < (int)components.size() && time_ok(); ci++) {
            if (!is_hard[ci]) continue;
            auto& comp = components[ci];

            double share = (total_hard_nodes > 0)
                           ? time_remaining * (double)comp.size() / total_hard_nodes
                           : time_remaining;
            share = max(1.0, share);

            ils_component(comp, share, final_weight_global, final_sol_global);
        }
    }

output:
    unfold_solution();
    print_solution();
    return 0;
}
\`\`\`

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

\`\`\`cpp
vector<int> kernelize() {
    queue<int> Q;
    vector<bool> in_queue(N + 1, false);
    for (int v = 1; v <= N; v++) {
        Q.push(v);
        in_queue[v] = true;
    }

    auto enqueue_neighbors = [&](int v) {
        for (int u : adj[v]) {
            if (!removed[u] && !in_queue[u]) {
                Q.push(u);
                in_queue[u] = true;
            }
        }
    };

    // Basic reductions (deg-0/1/2 + dominance)
    while (!Q.empty() && time_ok()) {
        int v = Q.front(); Q.pop();
        in_queue[v] = false;
        if (removed[v]) continue;

        int d = live_deg[v];

        // ── Degree-0: isolated vertex, always include ─────────────────────
        if (d == 0) {
            include_vertex(v);
            continue;
        }

        // ── Degree-1 ───────────────────────────────────────────────────────
        if (d == 1) {
            int u = single_neighbor(v);
            if (W[v] >= W[u]) {
                enqueue_neighbors(u);
                include_vertex(v);
            } else {
                // N-fold: W[v] < W[u]; fold leaf v away
                // opt({v,u}) = W[v] + opt_kernel(u'), where W[u'] = W[u]-W[v]
                fold_records.push_back({1, v, u, -1});
                fold_offset += W[v];
                W[u] -= W[v];
                enqueue_neighbors(v);
                if (!in_queue[u]) { Q.push(u); in_queue[u] = true; }
                mark_removed(v);
            }
            continue;
        }

        // ── Degree-2 ───────────────────────────────────────────────────────
        if (d == 2) {
            int a = -1, b = -1;
            for (int u : adj[v]) {
                if (!removed[u]) {
                    if (a == -1) a = u;
                    else { b = u; break; }
                }
            }
            // Triangle: at most one of {v,a,b} in IS — pick the heaviest
            if (has_edge(a, b)) {
                long long best = max({W[v], W[a], W[b]});
                int winner = (W[v] == best) ? v : (W[a] == best) ? a : b;
                enqueue_neighbors(winner);
                for (int x : {v, a, b}) enqueue_neighbors(x);
                include_vertex(winner);
                continue;
            }
            // Path a-v-b: include v if W[v] >= W[a]+W[b]
            if (W[v] >= W[a] + W[b]) {
                enqueue_neighbors(v);
                enqueue_neighbors(a);
                enqueue_neighbors(b);
                include_vertex(v);
                continue;
            }
            // W[v] < W[a]+W[b]: leave for LP reduction; V-fold only valid post-LP
            continue;
        }

        // ── Dominance: remove v if a heavier neighbor u has N[v] ⊆ N[u] ──
        if (d <= 12) {
            bool dominated = false;
            for (int u : adj[v]) {
                if (removed[u] || W[u] < W[v]) continue;
                bool dom = true;
                for (int w : adj[v]) {
                    if (removed[w] || w == u) continue;
                    if (!has_edge(u, w)) { dom = false; break; }
                }
                if (dom) {
                    enqueue_neighbors(v);
                    remove_vertex(v);
                    dominated = true;
                    break;
                }
            }
            if (dominated) continue;
        }
    }

    // ⋯ lp_reduce() (below) runs next, then this same reduction sweep runs
    // once more on the LP-modified graph — omitted here for length.
}
\`\`\`

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

\`\`\`cpp
// LP (Nemhauser-Trotter) reduction: forces LP=1 vertices in, LP=0 vertices out.
// Returns number of vertices decided.  Re-enqueues affected nodes for basic rules.
static int lp_reduce(queue<int>& Q, vector<bool>& inQ) {
    const long long INF = (long long)4e18;
    const int S = 0, T = 2*N+1;
    Dinic din(2*N+2);
    for (int v = 1; v <= N; v++) {
        if (removed[v]) continue;
        din.add_edge(S,   v,   W[v]);
        din.add_edge(N+v, T,   W[v]);
    }
    for (int v = 1; v <= N; v++) {
        if (removed[v]) continue;
        for (int u : adj[v]) {
            if (removed[u] || u <= v) continue;
            din.add_edge(v,   N+u, INF);
            din.add_edge(u,   N+v, INF);
        }
    }
    din.max_flow(S, T);
    auto R = din.reachable(S);  // R[node] = reachable in residual from s

    auto enq = [&](int u) { if (!removed[u]&&!inQ[u]) { Q.push(u); inQ[u]=true; } };

    int decided = 0;
    vector<int> inc, exc;
    for (int v = 1; v <= N; v++) {
        if (removed[v]) continue;
        bool lv = R[v], rv = R[N+v];
        if (lv && !rv)  inc.push_back(v);   // LP IS=1 → force in
        if (!lv && rv)  exc.push_back(v);   // LP IS=0 → force out
    }
    for (int v : exc) if (!removed[v]) { for (int u:adj[v]) enq(u); mark_removed(v); decided++; }
    for (int v : inc) if (!removed[v]) { for (int u:adj[v]) enq(u); include_vertex(v); decided++; }
    return decided;
}
\`\`\`

On real instances this alone reduces the graph by 90–99%; whatever survives
is the genuinely hard part.

## Phase 3 — Hybrid exact / heuristic solve

Whatever core remains after kernelization and LP fixing still has to be
solved, and the solver splits on structure.

**Tree components** are solved **exactly** in O(n) with a textbook DP —
there's no reason to guess when the shape guarantees a fast exact answer:

\`\`\`cpp
void tree_dp_iterative(const vector<int>& comp) {
    int root = comp[0];
    vector<int> order;
    order.reserve(comp.size());
    vector<bool> vis(N + 1, false);
    queue<int> bfsq;
    bfsq.push(root); vis[root] = true; par[root] = -1;
    while (!bfsq.empty()) {
        int v = bfsq.front(); bfsq.pop();
        order.push_back(v);
        for (int u : adj[v]) {
            if (!removed[u] && !vis[u]) {
                vis[u] = true; par[u] = v;
                bfsq.push(u);
            }
        }
    }
    for (int i = (int)order.size() - 1; i >= 0; i--) {
        int v = order[i];
        dp_in[v]  = W[v];
        dp_out[v] = 0;
        for (int u : adj[v]) {
            if (!removed[u] && u != par[v]) {
                dp_in[v]  += dp_out[u];
                dp_out[v] += max(dp_in[u], dp_out[u]);
            }
        }
    }
}

void tree_reconstruct(int root, bool take_root, vector<int>& result) {
    queue<pair<int,bool>> q;
    q.push({root, take_root});
    while (!q.empty()) {
        auto [v, take] = q.front(); q.pop();
        if (take) {
            result.push_back(v);
            for (int u : adj[v])
                if (!removed[u] && u != par[v]) q.push({u, false});
        } else {
            for (int u : adj[v])
                if (!removed[u] && u != par[v]) q.push({u, dp_in[u] >= dp_out[u]});
        }
    }
}

bool solve_as_tree(const vector<int>& comp, vector<int>& result, long long& score) {
    long long edges = 0;
    for (int v : comp)
        for (int u : adj[v]) if (!removed[u] && u > v) edges++;
    if (edges >= (long long)comp.size()) return false;

    unordered_map<int,int> uf;
    for (int v : comp) uf[v] = v;
    function<int(int)> find = [&](int x) -> int {
        return uf[x] == x ? x : uf[x] = find(uf[x]);
    };
    for (int v : comp) {
        for (int u : adj[v]) {
            if (removed[u] || u <= v) continue;
            int rv = find(v), ru = find(u);
            if (rv == ru) return false;
            uf[rv] = ru;
        }
    }

    unordered_set<int> incomp(comp.begin(), comp.end());
    vector<bool> vis(N + 1, false);
    score = 0;
    for (int root : comp) {
        if (vis[root]) continue;
        vector<int> sub;
        queue<int> q;
        q.push(root); vis[root] = true;
        while (!q.empty()) {
            int v = q.front(); q.pop();
            sub.push_back(v);
            for (int u : adj[v])
                if (!removed[u] && !vis[u] && incomp.count(u)) {
                    vis[u] = true; q.push(u);
                }
        }
        tree_dp_iterative(sub);
        int r = sub[0];
        score += max(dp_in[r], dp_out[r]);
        tree_reconstruct(r, dp_in[r] >= dp_out[r], result);
    }
    return true;
}
\`\`\`

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

\`\`\`cpp
bool probe_pass(const vector<int>& comp) {
    bool improved = false;
    for (int u : comp) {
        if (in_sol[u] || removed[u]) continue;
        if (conf[u] == 0) {
            add_to_sol(u);
            improved = true;
            continue;
        }
        long long gain = W[u];
        vector<int> nbrs_in_sol;
        for (int v : adj[u]) {
            if (!removed[v] && in_sol[v]) {
                gain -= W[v];
                nbrs_in_sol.push_back(v);
            }
        }
        if (gain > 0) {
            for (int v : nbrs_in_sol) remove_from_sol(v);
            add_to_sol(u);
            improved = true;
        }
    }
    return improved;
}

void local_search(const vector<int>& comp) {
    make_maximal(comp);
    bool improved = true;
    while (improved && time_ok()) {
        improved = false;
        if (probe_pass(comp))                         improved = true;
        if (time_ok() && one_two_swap_pass(comp))     improved = true;
        if (time_ok() && two_three_swap_pass(comp))   improved = true;
    }
}
\`\`\`

When local search stalls (no improvement for 40+ iterations), ILS
**adaptively increases the perturbation rate** — capped at 35% of the
current solution removed per kick — to escape the local optimum, then
resets back to a gentle 10% the moment it finds something better.

Because a hackathon time budget is a hard wall clock, not a suggestion, the
solver installs \`SIGTERM\`/\`SIGINT\` handlers so the current best feasible
set gets unfolded and printed immediately if the process is about to be
killed — the actual handler, plus the two functions it calls:

\`\`\`cpp
static bool unfold_done = false;
void unfold_solution() {
    if (unfold_done || fold_records.empty()) return;
    unfold_done = true;
    vector<bool> in_is(N + 1, false);
    for (int v : final_sol_global) in_is[v] = true;

    for (int i = (int)fold_records.size() - 1; i >= 0; i--) {
        auto& fr = fold_records[i];
        if (fr.type == 1) {
            // deg-1 fold: if supernode a not in IS → add leaf v
            if (!in_is[fr.a]) {
                in_is[fr.v] = true;
                final_sol_global.push_back(fr.v);
            }
        } else {
            // deg-2 fold: if supernode a in IS → add b; else → add v
            if (in_is[fr.a]) {
                in_is[fr.b] = true;
                final_sol_global.push_back(fr.b);
            } else {
                in_is[fr.v] = true;
                final_sol_global.push_back(fr.v);
            }
        }
    }
    final_weight_global += fold_offset;
}

void print_solution() {
    if (output_done) return;
    output_done = true;
    sort(final_sol_global.begin(), final_sol_global.end());
    final_sol_global.erase(unique(final_sol_global.begin(), final_sol_global.end()),
                           final_sol_global.end());
    cout << final_weight_global << "\\n";
    for (int i = 0; i < (int)final_sol_global.size(); i++) {
        if (i) cout << ' ';
        cout << final_sol_global[i];
    }
    cout << "\\n";
    cout.flush();
}

void signal_handler(int) { unfold_solution(); print_solution(); _exit(0); }
\`\`\`

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
are written up separately in the repo:
[RESEARCH.md](https://github.com/PriyanshuIITGHY2006/Hackathon-Squad/blob/main/RESEARCH.md).
`.trim();

// Long-form deep-dive for Prag-Dristi (#/project?id=prag-dristi). Code
// excerpts copied verbatim from the real repo — src/models/lstm_seq2seq.py,
// train.py, and src/evaluation/metrics.py.
const PRAG_DRISTI_BODY = `
## The problem

Assam floods almost every monsoon as the Brahmaputra swells, and the
difference between a managed evacuation and a disaster is often just a few
days of warning. Prag-Dristi predicts how much water the river will carry
over the next **seven days** at three monitoring stations, turned into an
actionable flood signal, trained on 23 years of ERA5 reanalysis and GloFAS
discharge data.

## Architecture — an LSTM encoder–decoder with Bahdanau attention

The encoder reads a 30-day input window and produces a hidden state per
day. A plain sequence-to-sequence model would compress all 30 days into one
fixed vector for the decoder to work from — **Bahdanau attention**
[Bahdanau et al., 2014] instead lets the decoder look back at *every*
encoder day on each future step and learn which ones actually matter, which
is closer to how a hydrologist reasons about upstream rainfall travelling
downstream over several days:

\`\`\`python
class BahdanauAttention(nn.Module):
    """
    Bahdanau (additive) attention.

    Computes alignment scores between decoder hidden state and all encoder
    hidden states, returns a weighted context vector.
    """

    def __init__(self, hidden_size: int):
        super().__init__()
        self.W_enc = nn.Linear(hidden_size, hidden_size, bias=False)
        self.W_dec = nn.Linear(hidden_size, hidden_size, bias=False)
        self.v = nn.Linear(hidden_size, 1, bias=False)

    def forward(
        self,
        decoder_hidden: torch.Tensor,  # (batch, hidden)
        encoder_outputs: torch.Tensor,  # (batch, enc_len, hidden)
    ) -> tuple[torch.Tensor, torch.Tensor]:
        # Expand decoder hidden to match encoder sequence length
        dec_h = decoder_hidden.unsqueeze(1)                 # (batch, 1, hidden)
        energy = torch.tanh(
            self.W_enc(encoder_outputs) + self.W_dec(dec_h) # (batch, enc_len, hidden)
        )
        scores = self.v(energy).squeeze(-1)                 # (batch, enc_len)
        weights = F.softmax(scores, dim=-1)                 # (batch, enc_len)

        # Weighted sum of encoder outputs
        context = torch.bmm(weights.unsqueeze(1), encoder_outputs)  # (batch, 1, hidden)
        context = context.squeeze(1)                                 # (batch, hidden)
        return context, weights
\`\`\`

The decoder is unrolled one day at a time. At each step it attends over the
encoder outputs, concatenates the resulting context vector with the
previous day's prediction, and feeds that into an LSTM cell followed by a
small feed-forward head that outputs a single discharge value:

\`\`\`python
class FloodForecastModel(nn.Module):
    """
    Full encoder-decoder model for multi-step discharge forecasting.
    """

    def __init__(
        self,
        input_size: int,
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.3,
        encoder_len: int = 30,
        decoder_len: int = 7,
        fc_hidden: int = 64,
        use_attention: bool = True,
    ):
        super().__init__()
        self.decoder_len = decoder_len

        self.encoder = LSTMEncoder(input_size, hidden_size, num_layers, dropout)
        self.decoder = LSTMDecoder(hidden_size, num_layers, dropout, fc_hidden, use_attention)

    def forward(
        self,
        x: torch.Tensor,
        teacher_forcing_ratio: float = 0.0,
        targets: torch.Tensor | None = None,
    ) -> torch.Tensor:
        # x: (batch, enc_len, input_size)
        enc_outputs, h_n, c_n = self.encoder(x)
        preds = self.decoder(
            enc_outputs, h_n, c_n,
            dec_len=self.decoder_len,
            teacher_forcing_ratio=teacher_forcing_ratio,
            targets=targets,
        )
        return preds  # (batch, dec_len)
\`\`\`

## Training on a rare event: a flood-weighted loss

Floods are under 8% of the record, so a model trained with plain MSE just
learns to predict "no flood" and still scores well on average. The fix is a
**flood-weighted MSE** that scales each timestep's squared error by how
close its true discharge is to the flood threshold — normal days get
weight ≈1, flood-peak days get weighted up to 5×:

\`\`\`python
# Flood-weighted MSE: errors on high-discharge timesteps are penalised more.
# Weight = 1 + flood_weight_multiplier * (y / flood_threshold).
# Normal days get weight ~1, flood-peak days get weight up to ~5x.
flood_threshold_normalised = float(cfg.flood_threshold)
flood_weight_multiplier = 4.0  # tune this: higher = more focus on peaks

def criterion(preds: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    # targets are log-normalised; reconstruct approximate raw scale for weighting
    targets_raw = torch.expm1(
        torch.tensor(
            tgt_scaler.inverse_transform(
                targets.detach().cpu().numpy().reshape(-1, 1)
            ).reshape(targets.shape),
            device=targets.device,
        )
    )
    weights = 1.0 + flood_weight_multiplier * torch.clamp(
        targets_raw / flood_threshold_normalised, min=0.0, max=1.0
    )
    return (weights * (preds - targets) ** 2).mean()
\`\`\`

## Evaluation — hydrology metrics, not just RMSE

Discharge forecasts get judged against the field's own standard metrics
rather than generic regression error. **NSE** (Nash–Sutcliffe Efficiency)
[Nash & Sutcliffe, 1970] compares the model's error to how well simply
predicting the historical mean would do; **KGE** (Kling–Gupta Efficiency)
[Gupta et al., 2009] separately scores correlation, variability, and bias
and combines them into one number:

\`\`\`python
def nse(obs: np.ndarray, sim: np.ndarray) -> float:
    """Nash-Sutcliffe Efficiency."""
    obs, sim = np.asarray(obs, float), np.asarray(sim, float)
    mask = np.isfinite(obs) & np.isfinite(sim)
    obs, sim = obs[mask], sim[mask]
    num = np.sum((obs - sim) ** 2)
    denom = np.sum((obs - np.mean(obs)) ** 2)
    if denom == 0:
        return np.nan
    return float(1.0 - num / denom)


def kge(obs: np.ndarray, sim: np.ndarray) -> float:
    """Kling-Gupta Efficiency (Gupta et al. 2009)."""
    obs, sim = np.asarray(obs, float), np.asarray(sim, float)
    mask = np.isfinite(obs) & np.isfinite(sim)
    obs, sim = obs[mask], sim[mask]

    r = np.corrcoef(obs, sim)[0, 1]
    alpha = np.std(sim) / (np.std(obs) + 1e-9)
    beta = np.mean(sim) / (np.mean(obs) + 1e-9)
    return float(1.0 - np.sqrt((r - 1) ** 2 + (alpha - 1) ** 2 + (beta - 1) ** 2))
\`\`\`

## Results

On unseen years (data the model never trained on):

| Metric | Score | Reading |
|---|---|---|
| NSE | **0.924** | >0.90 is considered excellent |
| KGE | **0.920** | >0.90 is considered excellent |
| POD (Probability of Detection) | **0.651** | catches 65% of actual flood events |
| FAR (False Alarm Ratio) | **0.065** | only 6.5% of flood alarms are false |
`.trim();

// Long-form deep-dive for MemoryOS (#/project?id=memoryos). Code excerpts
// copied verbatim from the real repo — backend/managers/context_manager.py,
// backend/managers/graph_manager.py, and backend/managers/archival_manager.py.
// Two honesty notes are called out explicitly below: the README's Hebbian
// "decay" half has no corresponding implementation (only the strengthening
// half is real), and entity resolution for near-duplicate names is an LLM
// tool call, not a standalone fuzzy-matching algorithm.
const MEMORYOS_BODY = `
## The problem

Large language models are **stateless**: each request only knows what's in
its context window. Re-sending the entire chat history every turn gets
slow and expensive fast, and eventually overflows the window. MemoryOS
gives the model an external memory it can write to and read from instead —
a **Neo4j knowledge graph** for entities and relationships, a **ChromaDB**
vector store for semantic recall, and a small active buffer for the most
recent turns — so the prompt stays roughly constant in size no matter how
long the conversation runs.

## Surprise-weighted adaptive forgetting

Not every memory should decay at the same rate. A "surprising" memory — one
that was semantically distant from anything already stored, computed as
cosine distance to its nearest ChromaDB neighbor at write time — decays
**more slowly**, so it stays relevant in context longer than routine,
predictable information:

\`\`\`python
def relevance_score(
    query_tokens: set,
    content: str,
    last_turn: int,
    current_turn: int,
    access_count: int,
    surprise: float = 0.5,
) -> float:
    """
    Extended relevance score in [0, 1] with surprise-weighted adaptive decay.
    """
    # 1. Keyword overlap (query-biased Jaccard)
    ct = _tokenize(content)
    keyword = (
        len(query_tokens & ct) / max(len(query_tokens), 1)
        if query_tokens and ct
        else 0.0
    )

    # 2. Surprise-weighted adaptive exponential decay
    #    λ_eff = λ_base · (1 − α_s · surprise)
    #    High surprise → slower decay → longer retention in context
    delta        = max(0, current_turn - max(0, last_turn or 0))
    lambda_eff   = config.RELEVANCE_DECAY_LAMBDA * (
        1.0 - config.SURPRISE_RETENTION_ALPHA * min(max(surprise, 0.0), 1.0)
    )
    recency      = math.exp(-lambda_eff * delta)

    # 3. Log-normalised access frequency (capped at 100 for normalisation)
    freq = math.log1p(max(0, access_count or 0)) / math.log1p(100)

    # 4. Surprise salience bonus — intrinsically important memories score higher
    sal = min(max(surprise, 0.0), 1.0)

    return (
        config.RELEVANCE_KEYWORD_WEIGHT  * keyword
        + config.RELEVANCE_RECENCY_WEIGHT  * recency
        + config.RELEVANCE_FREQ_WEIGHT     * freq
        + config.RELEVANCE_SURPRISE_WEIGHT * sal
    )
\`\`\`

With \`RELEVANCE_DECAY_LAMBDA = 0.001\` and \`SURPRISE_RETENTION_ALPHA = 0.70\`,
a maximally-surprising memory (surprise = 1) decays at 0.30 × the base
rate — about **3.3× slower**, matching what the project claims.

## Personalized PageRank spreading activation

Once memories are scored, a small **Personalized PageRank** pass spreads
activation across the entity graph so implicit connections surface too —
an entity that's strongly linked to a highly-relevant one gets a boost even
if it didn't directly match the query:

\`\`\`python
def spreading_activation(
    scored_entities: list[tuple[float, dict]],
    damping: float = None,
    iterations: int = None,
) -> list[tuple[float, dict]]:
    d    = damping    if damping    is not None else config.PPR_DAMPING
    k    = iterations if iterations is not None else config.PPR_ITERATIONS

    if not scored_entities or k == 0:
        return scored_entities

    name_to_idx   = {}
    init_scores   = []
    entities_list = []

    for i, (sc, ent) in enumerate(scored_entities):
        name = (ent.get("name") or "").strip().lower()
        if name:
            name_to_idx[name] = i
        init_scores.append(sc)
        entities_list.append(ent)

    n = len(init_scores)
    if n <= 1:
        return scored_entities

    r = list(init_scores)

    for _ in range(k):
        r_new = [(1.0 - d) * init_scores[i] for i in range(n)]

        for i, ent in enumerate(entities_list):
            links = ent.get("_links") or []
            if not links:
                continue
            out_weight = r[i] / len(links)
            for link in links:
                target_name = (link.get("nm") or "").strip().lower()
                j = name_to_idx.get(target_name)
                if j is not None and j != i:
                    r_new[j] += d * out_weight

        # Normalise to [0,1] to prevent score inflation
        max_r = max(r_new) or 1.0
        r     = [x / max_r for x in r_new]

    # Blend PPR score back with original (0.6 PPR + 0.4 original)
    blended = [
        (0.6 * r[i] + 0.4 * init_scores[i], entities_list[i])
        for i in range(n)
    ]
    blended.sort(key=lambda x: x[0], reverse=True)
    return blended
\`\`\`

\`PPR_DAMPING = 0.25\`, \`PPR_ITERATIONS = 4\` — the "4-iteration" pass the
project describes.

## Hebbian co-activation learning

Entities that get retrieved together in the same turn have their graph edge
strengthened — "neurons that fire together, wire together" — so future
retrievals surface related entities as a pair more readily:

\`\`\`python
def hebbian_strengthen(self, entity_names: list[str], current_turn: int):
    """
    Strengthen edges between entities that were co-retrieved in the same turn.

        w_{ij}^{new} = w_{ij}^{old} + η   for all pairs (i,j)

    Runs in a background thread — non-blocking.
    """
    names = [n for n in entity_names if n]
    if len(names) < 2:
        return
    eta = config.HEBBIAN_LEARNING_RATE

    with self.driver.session() as s:
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a, b = names[i], names[j]
                s.run(
                    """
                    MATCH (x) WHERE x.name = $a AND x.user_id = $uid
                    MATCH (y) WHERE y.name = $b AND y.user_id = $uid
                    MERGE (x)-[r:RELATED_TO]-(y)
                    ON CREATE SET r.co_activation_count = 1,
                                  r.hebbian_weight = $eta,
                                  r.rel_type = 'co_activated',
                                  r.last_seen = $turn
                    ON MATCH  SET r.co_activation_count =
                                      coalesce(r.co_activation_count, 0) + 1,
                                  r.hebbian_weight =
                                      coalesce(r.hebbian_weight, 0) + $eta,
                                  r.last_seen = $turn
                    """,
                    a=a, b=b, uid=self.user_id, eta=eta, turn=current_turn,
                )
\`\`\`

Worth being precise about: only the *strengthening* half is real. The
module docstring also documents a decay formula for unused edges
(\`w_{ij}^{t+1} = w_{ij}^{t}·(1−δ_H)\`), and its constant (\`HEBBIAN_DECAY\`)
exists in config — but nothing in the codebase actually calls it. Edges get
stronger; they don't currently get weaker.

## Entity resolution

New information about an existing entity is stitched onto the same graph
node automatically via a Neo4j \`MERGE\` keyed on name — this part is
genuinely automatic, no LLM involved:

\`\`\`python
s.run(
    f"""
    MERGE (e:{label} {{name: $name, user_id: $uid}})
    ON CREATE SET e.created_turn = $turn, e.access_count = 1
    ON MATCH  SET e.access_count = coalesce(e.access_count,0)+1,
                  e.last_seen_turn = $turn
    SET e += $attrs
    """,
    name=clean_name, uid=self.user_id, turn=turn, attrs=attrs,
)
\`\`\`

Merging two *different* names that refer to the same real-world entity
(e.g. "Bob" and "my brother") is a separate path, and it's worth being
precise here too: there's no embedding-similarity or string-distance
dedup algorithm in the codebase. It's exposed as a tool the LLM can call
mid-conversation — the system prompt instructs it to invoke
\`merge_entities(canonical, alias)\` when it notices a duplicate — so
resolution here is agent-driven, not a standalone deterministic algorithm.
`.trim();

// Long-form deep-dive for the Minimum-Variance Portfolio Optimizer
// (#/project?id=min-variance). Code excerpts copied verbatim from app.py —
// the entire real script is short enough to show almost in full. Note this
// version computes the sample covariance directly (no Ledoit-Wolf shrinkage
// library in the actual code) and PSD-corrects it manually.
const MIN_VARIANCE_BODY = `
## The problem

In Modern Portfolio Theory, a portfolio's risk is its return *variance*,
and the **minimum-variance portfolio** is the mix of assets that makes that
variance as small as possible. This script pulls historical prices for
five tickers via **yfinance**, estimates how they move together, and solves
directly for the risk-minimizing, long-only weights.

## Keeping the covariance matrix usable

A sample covariance matrix, estimated straight from historical returns, is
often not quite **positive semi-definite** due to floating-point noise —
which breaks the optimization that follows. This function clips any
negative eigenvalues up to a tiny epsilon and reconstructs a valid matrix
from the corrected eigendecomposition:

\`\`\`python
def nearest_psd(A, eps=1e-10):
    A = np.array(A, dtype=float)
    A = (A + A.T) / 2
    vals, vecs = np.linalg.eigh(A)
    vals = np.maximum(vals, eps)
    A_psd = vecs @ np.diag(vals) @ vecs.T
    return (A_psd + A_psd.T) / 2
\`\`\`

## Solving for the weights

The unconstrained minimum-variance solution has a closed form:
\`w = Σ⁻¹𝟙 / (𝟙ᵀΣ⁻¹𝟙)\`, using the Moore–Penrose pseudo-inverse so it's
well-defined even when \`Σ\` is singular. That alone can still produce
negative weights (a short position), so the no-short-selling constraint is
enforced afterward by clipping negatives to zero and renormalizing so the
weights sum back to 1:

\`\`\`python
def compute_min_var_weights(Sigma_df):
    Sigma = Sigma_df.values
    n = Sigma.shape[0]
    Sigma_psd = nearest_psd(Sigma)
    ones = np.ones(n)
    Sigma_inv = np.linalg.pinv(Sigma_psd)
    w = Sigma_inv @ ones
    d = ones @ w
    if d == 0 or np.isnan(d):
        w = np.ones(n) / n
    else:
        w = w / d
    w[w < 0] = 0
    s = w.sum()
    if s == 0 or np.isnan(s):
        w = np.ones(n) / n
    else:
        w = w / s
    return pd.Series(w, index=Sigma_df.index)
\`\`\`

The rest of the script is defensive plumbing around real-world Yahoo
Finance data: \`extract_adj_close()\` handles both the old flat-column and
newer multi-index response shapes, \`clean_and_select_columns()\` drops
duplicate/missing tickers with a warning instead of crashing, and the CLI
loop forward/backward-fills small gaps before computing daily returns and
covariance.

## Running it

Five tickers in, a \`weights.csv\` out — no short selling, weights sum to 1:

\`\`\`
Enter 5 tickers separated by spaces:
AAPL MSFT AMZN TSLA GOOG

Minimum-Variance Weights
        weight
AAPL    0.183...
MSFT    0.241...
AMZN    0.096...
TSLA    0.052...
GOOG    0.427...

Saved weights.csv
\`\`\`
`.trim();

// Long-form deep-dive for the Automated Competitive Programming Archive
// (#/project?id=cp-archive). Code excerpts copied verbatim from fetch.py.
const CP_ARCHIVE_BODY = `
## What it does

Competitive programmers accumulate hundreds of solved problems that
usually just rot in scattered local files. This archiver talks to the
**Codeforces REST API**, pulls every Accepted C++ submission, and turns
them into a structured, browsable, self-updating repository — matching any
locally-kept \`.cpp\` solution to its problem automatically by filename.

## Talking to the Codeforces API

A single paginated call to \`user.status\` returns every submission ever
made; the archiver filters down to unique, Accepted, C++ problems (keeping
only the first AC per problem, since re-solving the same problem twice
shouldn't produce two entries):

\`\`\`python
def get_ac_submissions():
    subs = cf_api_request("user.status", {"handle": CF_HANDLE, "from": "1", "count": "100000"})
    seen = set()
    result = []
    for s in subs:
        if s.get("verdict") != "OK":
            continue
        lang = s.get("programmingLanguage", "")
        if LANG_FILTER.lower() not in lang.lower():
            continue
        prob = s["problem"]
        key = f"{prob.get('contestId', 0)}{prob.get('index', '')}"
        if key in seen:
            continue
        seen.add(key)
        result.append(s)
    return result
\`\`\`

## Matching local solutions to problems

Before writing anything, the script scans the \`solutions/\` folder for any
\`.cpp\` files the user has dropped in by hand, keyed by the contest+index
prefix in the filename (e.g. \`1097B.cpp\`):

\`\`\`python
def load_user_solutions():
    """Load all .cpp files from solutions/ folder, keyed by problem ID."""
    SOLUTIONS_DIR.mkdir(exist_ok=True)
    user_code = {}
    for f in SOLUTIONS_DIR.glob("*.cpp"):
        m = re.match(r'^(\\d+[A-Za-z]\\d*)', f.name)
        if m:
            user_code[m.group(1)] = f.read_text(encoding="utf-8", errors="replace")
    return user_code
\`\`\`

## Writing the archive

For every submission, a folder gets created under \`problems/<rating>/\`
with a generated README (problem name, rating, tags, submission link) and
either the real solution or a placeholder pointing back to Codeforces if no
local code exists yet:

\`\`\`python
def write_problem(sub, user_code):
    prob = sub["problem"]
    contest_id = prob.get("contestId", 0)
    index = prob.get("index", "")
    name = prob.get("name", "Unknown")
    rating = prob.get("rating")
    tags = prob.get("tags", [])
    key = f"{contest_id}{index}"

    folder_name = f"{contest_id}{index}-{sanitize(name)}"
    prob_dir = PROBLEMS_DIR / rating_bucket(rating) / folder_name
    prob_dir.mkdir(parents=True, exist_ok=True)

    lines = [
        f"# {contest_id}{index} - {name}\\n",
        f"**Contest:** [{contest_id}](https://codeforces.com/contest/{contest_id})\\n",
        f"**Problem:** [{index}](https://codeforces.com/contest/{contest_id}/problem/{index})\\n",
        f"**Rating:** {rating if rating else 'Unrated'}\\n",
        f"**Tags:** {', '.join(f'\`{t}\`' for t in tags) if tags else 'None'}\\n",
        f"**Language:** {sub.get('programmingLanguage', 'C++')}\\n",
        f"**Submission:** [Link](https://codeforces.com/contest/{contest_id}/submission/{sub['id']})\\n",
    ]
    (prob_dir / "README.md").write_text("\\n".join(lines), encoding="utf-8")

    code = user_code.get(key)
    if code:
        (prob_dir / "solution.cpp").write_text(code, encoding="utf-8")
    else:
        placeholder = (
            f"// Problem: {contest_id}{index} - {name}\\n"
            f"// Submission: https://codeforces.com/contest/{contest_id}/submission/{sub['id']}\\n"
            f"//\\n"
            f"// Drop {key}.cpp into the solutions/ folder and push to add your code here.\\n"
        )
        sol_path = prob_dir / "solution.cpp"
        if not sol_path.exists() or sol_path.read_text().startswith("// Problem:"):
            sol_path.write_text(placeholder, encoding="utf-8")
\`\`\`

## Building the index

A top-level README is regenerated on every run: every problem in a sorted
table, plus a tag-distribution and rating-distribution breakdown, so the
archive doubles as a personal analytics dashboard of what's actually been
practiced:

\`\`\`python
def generate_index(all_subs, user_code):
    total = len(all_subs)
    with_code = sum(1 for s in all_subs
                    if f"{s['problem'].get('contestId',0)}{s['problem'].get('index','')}" in user_code)

    lines = [
        f"# Codeforces Solutions Archive\\n",
        f"**Handle:** [{CF_HANDLE}](https://codeforces.com/profile/{CF_HANDLE})\\n",
        f"**Total Problems:** {total}\\n",
        f"**With Source Code:** {with_code} / {total}\\n",
    ]

    tag_count = {}
    for s in all_subs:
        for t in s["problem"].get("tags", []):
            tag_count[t] = tag_count.get(t, 0) + 1
    lines.append("\\n## Tag Distribution\\n")
    for tag, count in sorted(tag_count.items(), key=lambda x: -x[1]):
        lines.append(f"| \`{tag}\` | {count} |")

    (REPO_ROOT / "README.md").write_text("\\n".join(lines), encoding="utf-8")
\`\`\`
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
    body: PRAG_DRISTI_BODY,
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
    body: MEMORYOS_BODY,
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
    stack: ["Python", "NumPy", "pandas", "yfinance", "Modern Portfolio Theory"],
    github: "https://github.com/PriyanshuIITGHY2006/min-var-portfolio",
    tagline:
      "A quantitative pipeline that builds the lowest-risk long-only stock portfolio using Modern Portfolio Theory.",
    detail: [
      "In Modern Portfolio Theory, a portfolio's risk is its return <i>variance</i>, and the <b>minimum-variance portfolio</b> is the specific mix of assets that makes that variance as small as possible. This project automates the whole construction: it pulls historical prices via <b>yfinance</b>, estimates how the assets move together, and solves for the weights that minimise risk.",
      "The hard part is the <b>covariance matrix</b>. Estimated naïvely from a sample, it can fail to be mathematically valid for optimisation due to floating-point noise, which would otherwise produce unstable, garbage portfolios. The pipeline applies a <b>nearest-PSD correction</b> — clipping negative eigenvalues and reconstructing from the corrected eigendecomposition — to force the matrix back to being positive semi-definite so the optimiser is well-posed.",
      "Finally it enforces realistic constraints — <b>no short selling</b> (weights stay non-negative) and full weight normalisation — so the output is an actually investable long-only portfolio rather than a theoretical one.",
    ],
    highlights: [
      "Closed-form min-variance solution via the Moore–Penrose pseudo-inverse",
      "Nearest-PSD correction for covariance stability",
      "No-short-selling constraints with normalised weights",
    ],
    body: MIN_VARIANCE_BODY,
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
    body: CP_ARCHIVE_BODY,
  },
];
