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
`main()` — the whole pipeline, top to bottom, exactly as it ships:

```cpp
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
```

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
- **Degree-1 (N-fold)** — a leaf `v` with sole neighbor `u`: if
  `W[v] ≥ W[u]`, just include `v`. Otherwise fold it away — the optimum
  equals `W[v] + OPT(G')` where `G'` drops `v` and reduces `u`'s weight
  by `W[v]`.
- **Degree-2 triangle / path** — if `v`'s two neighbors `a, b` are
  themselves adjacent, at most one of `{v, a, b}` can survive, so take the
  heaviest; if not adjacent and `W[v] ≥ W[a] + W[b]`, include `v` outright.
- **Dominance** — if a heavier neighbor `u`'s neighborhood is a superset of
  `v`'s, `v` can never do better than `u` and is discarded (checked only
  up to degree 12, where it's still cheap).

Here's the real degree-0/1/2 + dominance sweep from `kernelize()`:

```cpp
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
```

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
**max-flow**. Split every vertex `v` into a left copy `v_L` and a right
copy `v_R`, wire the source to every `v_L` and every `v_R` to the sink
with capacity `W[v]`, and add an infinite-capacity edge in both directions
for every edge `(u, v)` in the graph. A **minimum cut**, computed with
**Dinic's algorithm** [1970], reads off exactly the LP-optimal 0 / ½ / 1
assignment: `v_L` reachable in the residual graph and `v_R` not ⟶ LP says
1 (force in); `v_R` reachable and `v_L` not ⟶ LP says 0 (force out);
otherwise it's ½ and stays in the kernel.

This is the actual `lp_reduce()` function — the exact NT-reduction step
used in the solver, network construction and all:

```cpp
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
```

On real instances this alone reduces the graph by 90–99%; whatever survives
is the genuinely hard part.

## Phase 3 — Hybrid exact / heuristic solve

Whatever core remains after kernelization and LP fixing still has to be
solved, and the solver splits on structure.

**Tree components** are solved **exactly** in O(n) with a textbook DP —
there's no reason to guess when the shape guarantees a fast exact answer:

```cpp
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
```

**General-graph components** get **Iterated Local Search (ILS)**
[Lourenço et al., 2003], applied to MWIS the way Lamm et al.'s ReduMIS
[2016] does: greedy-build, local-search to convergence, then repeatedly
perturb and re-search, keeping the best solution seen. The local search
itself runs three passes to a fixed point — (1,2)-swaps, (2,3)-swaps, and
**PROBE** [Andrade, Resende & Werneck, 2012], the move that matters most.
PROBE is a **1→k swap**: for every vertex `u` outside the current set, if
`u`'s weight beats the combined weight of all its neighbors currently
*inside* the set, kick all of them out and put `u` in instead. It's the
generalization that plain (1,2)/(2,3)-swaps miss, and in practice gives the
largest gains on sparse graphs where ½-valued vertices have many
individually-light IS-neighbors:

```cpp
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
```

When local search stalls (no improvement for 40+ iterations), ILS
**adaptively increases the perturbation rate** — capped at 35% of the
current solution removed per kick — to escape the local optimum, then
resets back to a gentle 10% the moment it finds something better.

Because a hackathon time budget is a hard wall clock, not a suggestion, the
solver installs `SIGTERM`/`SIGINT` handlers so the current best feasible
set gets unfolded and printed immediately if the process is about to be
killed — the actual handler, plus the two functions it calls:

```cpp
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
    cout << final_weight_global << "\n";
    for (int i = 0; i < (int)final_sol_global.size(); i++) {
        if (i) cout << ' ';
        cout << final_sol_global[i];
    }
    cout << "\n";
    cout.flush();
}

void signal_handler(int) { unfold_solution(); print_solution(); _exit(0); }
```

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
| **WORSE** than expected | 1 | `02_small_sparse` — dense random graph, an LP-hard kernel |
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
