---
title: Bin Packing — Why It's Hard, How to Approximate It, and When It Isn't Hard At All
date: 2026-07-07
tags: Algorithms, Complexity Theory, Approximation Algorithms, Competitive Programming
cover: blogs/bin-packing-np-hardness-approximation-algorithms/cover.png
excerpt: A full pass through bin packing — the formal problem, why the decision version is NP-complete (and why the optimization version is strongly so), every classical approximation algorithm with its proven bound, the special cases that collapse back to polynomial time, and the backtracking/bitmask-DP techniques you'd actually use to solve small instances in a contest.
---

Bin packing is one of those problems that shows up so often — VM placement on cloud hosts, cutting stock in a sheet-metal shop, scheduling ad slots, literally packing boxes into a truck — that most people write a "first fit" loop for it without ever asking what they're actually trading away by not solving it exactly. This is the write-up I wish I'd had: the formal problem, exactly why it's NP-hard (and the sharper, less commonly explained fact that it's *strongly* NP-hard), every classical approximation algorithm with its proven worst-case bound, the handful of special cases where the problem quietly becomes polynomial, and the backtracking/bitmask techniques you'd reach for if a contest handed you a small instance and expected an exact answer.

## The problem, stated plainly

You're given $n$ items with positive sizes $s_1, s_2, \dots, s_n$ and bins of uniform capacity $C$. Every item must go into exactly one bin, and no bin's contents may sum past $C$. The **optimization version** asks for the minimum number of bins. The **decision version** asks a yes/no question instead: can everything fit into at most $k$ bins? That distinction matters more than it looks like it should — the complexity argument in the next section is built entirely on the decision version, and then extended to the optimization version afterward.

Two numbers come up constantly, so name them now: $S = \sum_i s_i$ is the total size of everything, and $\lceil S / C \rceil$ is the obvious *lower bound* on the number of bins — you can never do better than "total volume divided by bin volume," even though you can absolutely do worse.

## Why it's hard: a full pass through the complexity argument

I'm not going to assume you remember the exact definitions here, because half the value of "explaining bin packing's complexity" is being precise about what these words mean rather than gesturing at them.

**P** is the class of decision problems solvable in time polynomial in the input size. **NP** is the class of decision problems where a proposed "yes" answer can be *verified* in polynomial time, even if finding that answer might take much longer — for bin packing's decision version, the certificate is just the assignment of items to bins, and checking it means summing each bin once, which is $O(n)$.

**NP-hard** means every problem in NP reduces to it in polynomial time — informally, it's "at least as hard as anything in NP," but it doesn't have to be in NP itself (it might not even be a decision problem). **NP-complete** is the intersection: NP-hard *and* in NP. Bin packing's decision version is a textbook NP-complete problem. Its optimization version — "find the minimum $k$," not just "is $k$ enough" — is NP-hard but isn't itself a yes/no question, so "NP-complete" doesn't technically apply to it; showing the decision version is NP-complete is what makes the optimization version NP-hard (an oracle that solves the optimization version in poly time would let you binary-search $k$ and solve the decision version in poly time too).

### The reduction: PARTITION becomes a 2-bin question

The standard proof reduces from **PARTITION**: given a multiset of positive integers $A = \{a_1, \dots, a_m\}$ with total sum $S$, can $A$ be split into two subsets with equal sum? PARTITION is a classical NP-complete problem (it's *weakly* NP-complete, a distinction that turns out to matter — more on that in a moment).

The reduction is almost embarrassingly direct: take the same multiset as your bin-packing items, set the bin capacity to $C = S/2$, and ask whether two bins suffice. If $S$ is odd, no partition can exist and the answer is trivially "no" either way. If $S$ is even, then packing everything into two bins of capacity $S/2$ is only possible if each bin's contents sum to *exactly* $S/2$ — any other split would push one bin over capacity, since the two bins together must account for all of $S$. So PARTITION on $A$ is solvable exactly when bin packing on $A$ fits into 2 bins of capacity $S/2$:

$$\text{PARTITION}(A) \iff \text{BinPack}(A,\, k{=}2,\, C{=}S/2)$$

That's a polynomial-time reduction (it's literally the identity on the input, plus one division), which means 2-bin decision packing is at least as hard as PARTITION. Since the certificate-checking argument above put it in NP, and this reduction puts it in NP-hard, bin packing's decision version is NP-complete. $\blacksquare$

### The sharper fact: bin packing is *strongly* NP-hard

Here's the detail most casual treatments skip. PARTITION is only **weakly** NP-hard — it has a pseudo-polynomial time algorithm (the classic subset-sum DP, $O(nS)$), so if your numbers are small (polynomially bounded in $n$), PARTITION is easy in practice. The PARTITION reduction above only shows bin packing is *weakly* NP-hard too, for the specific case of $k=2$.

The general bin-packing optimization problem is hard in a strictly stronger sense: it's **strongly** NP-hard, meaning no algorithm can solve it in time polynomial in $n$ *and* $\max_i s_i$ — not even if every item size is small. No pseudo-polynomial algorithm exists unless P = NP. This is proven by reducing from **3-PARTITION** instead: given $3m$ positive integers with total sum $mT$, where every single integer is constrained to lie strictly between $T/4$ and $T/2$, decide whether they can be grouped into $m$ triples each summing to exactly $T$. That size constraint is the whole trick — it forces *exactly three* elements into every group in any valid solution (two elements can sum to at most just under $T$, and four elements sum to more than $T$ at minimum), which is what makes 3-PARTITION so much more rigid, and so much harder, than PARTITION. Garey and Johnson proved 3-PARTITION strongly NP-complete in *Computers and Intractability* (1979), and it remains the standard hammer for proving strong NP-hardness across bin packing, scheduling, and cutting-stock problems to this day.

Reducing to bin packing is the same trick as before — items are the $3m$ integers, capacity is $T$, ask if $m$ bins suffice — except now the size restriction guarantees a feasible packing must use exactly three items per bin, which is exactly the structure 3-PARTITION needs. Because the reduction keeps the numbers polynomially bounded, this shows bin packing itself is strongly NP-hard, not just weakly so.

Why should you care about weak versus strong? Because it tells you where hope is allowed to live. A weakly NP-hard problem might have a fast exact algorithm hiding behind small numbers — subset sum, knapsack, PARTITION. Bin packing doesn't get that escape hatch. The exponential blowup is fundamental to the structure of the problem, not an artifact of large item sizes.

## Exact algorithms

For small instances, or as a subroutine inside something bigger, you sometimes want the actual optimum rather than a bound on how far off you might be.

- **Brute force** — try every assignment of items to bins. Astronomically slow ($O(k^n)$-ish), useful only as a correctness oracle for testing faster methods.
- **Bitmask DP** — see the competitive-programming section below; this is the one you'd actually reach for at $n \le 20$.
- **ILP formulation** — binary variables $x_{ij} = 1$ if item $i$ goes in bin $j$, and $y_j = 1$ if bin $j$ is used at all; minimize $\sum_j y_j$ subject to $\sum_j x_{ij} = 1$ for every item and $\sum_i s_i x_{ij} \le C \cdot y_j$ for every bin. Solvable with any off-the-shelf ILP solver for moderate sizes, though symmetry between interchangeable bins tends to slow branch-and-bound down badly unless you add symmetry-breaking constraints.
- **Branch and bound** — Martello and Toth's MTP algorithm and Korf's bin-completion algorithm are the two names that come up repeatedly in the literature; both exploit strong lower bounds and dominance rules to prune aggressively, and both can solve instances with hundreds of items in practice, far beyond what brute force or bitmask DP could touch.
- **The cutting-stock connection** — bin packing *is* the cutting-stock problem (minimizing the number of raw material rolls cut into ordered piece lengths), and the Gilmore–Gomory formulation solves its LP relaxation via column generation: instead of enumerating every possible "pattern" of items in a bin up front (there can be exponentially many), you generate promising patterns on demand by solving a knapsack subproblem. This is the actual industrial approach for large instances, and it routinely gets within a fraction of a bin of optimal.

## Approximation algorithms

This is the heart of the problem in practice — nobody runs an ILP solver to pack VMs onto hosts every few seconds. Every algorithm below is greedy, runs in at most $O(n \log n)$, and comes with a *proven* worst-case guarantee relative to $\mathrm{OPT}$, the optimal bin count.

### Next Fit

Keep exactly one bin "open." If the current item fits, place it there; otherwise close that bin for good, open a fresh one, and place it there. Next Fit never looks back at an old bin, which is what makes it fast (genuinely $O(n)$, no data structure needed) and also what makes it wasteful.

:::binviz
algorithm: next-fit
capacity: 10
items: 6,5,4,3,7,2
caption: Next Fit on [6, 5, 4, 3, 7, 2], capacity 10 — never reconsiders a closed bin
:::

Watch bin 1 in that trace: it closes with 4 units of slack the instant item 3 doesn't fit, and that slack is gone forever — Next Fit will never place anything there again, even though a later small item might have fit perfectly. Run First Fit on the exact same six items and it packs them into **3** bins instead of Next Fit's 4, precisely because it's willing to look back.

The bound is a clean, tight $\mathrm{NF}(I) \le 2 \cdot \mathrm{OPT}(I)$: any two consecutive bins Next Fit closes must together exceed $C$ (otherwise it would've merged their contents), so you can never have "too many" half-empty bins stacking up.

### First Fit and Best Fit

**First Fit** scans every open bin in order and places the item in the first one it fits. **Best Fit** scans every open bin and places the item in whichever one leaves the *least* leftover space (breaking ties however you like). Both need a way to query "which bins fit this item" efficiently — a balanced BST keyed by remaining capacity gets both down to $O(n \log n)$.

:::binviz
algorithm:first-fit
capacity: 10
items: 4,8,1,4,2,1,7,3
caption: First Fit on [4, 8, 1, 4, 2, 1, 7, 3], capacity 10
:::

:::binviz
algorithm: best-fit
capacity: 10
items: 2,5,4,7,1,3
caption: Best Fit on [2, 5, 4, 7, 1, 3], capacity 10
:::

That Best Fit example is worth sitting with for a second. Run First Fit on the identical six items and it *also* finishes in 3 bins — but with 2, 3, and 3 units of slack scattered across them. Best Fit finishes with 2, 6, and **0** — it drives one bin to exactly full. Same bin count, different local decisions, because Best Fit's criterion ("leave as little room as possible") concentrates leftover space instead of spreading it thin. That's a genuinely different greedy policy, even though the two algorithms are asymptotically just as good as each other in the worst case.

Johnson proved in 1973 that both First Fit and Best Fit satisfy $\mathrm{FF}(I), \mathrm{BF}(I) \le 1.7 \cdot \mathrm{OPT}(I)$ asymptotically (technically $\le \lfloor 1.7 \cdot \mathrm{OPT}(I) \rfloor$ for large $\mathrm{OPT}$) — noticeably better than Next Fit's factor of 2, purely because they're willing to reconsider every open bin instead of just the most recent one.

### First Fit Decreasing (and Best Fit Decreasing)

Sort the items largest-first, then run First Fit. That's the entire algorithm, and it's the one I'd reach for by default if you told me "just pack these well and don't overthink it."

:::binviz
algorithm: first-fit-decreasing
capacity: 10
items: 3,7,2,8,5,4,1,6
caption: First Fit Decreasing on [3, 7, 2, 8, 5, 4, 1, 6], capacity 10 — sorted internally to [8,7,6,5,4,3,2,1] before packing
:::

That example packs eight items summing to 36 into exactly 4 bins — which is optimal, since $\lceil 36/10 \rceil = 4$, and three of the four bins finish completely full. Sorting first buys a real, provable improvement: Johnson's 1973 paper established the asymptotic ratio $11/9$, and it took until 2007 for Dósa to show that bound is *tight* — no worse example exists — with the exact additive constant, $\mathrm{FFD}(I) \le \frac{11}{9}\mathrm{OPT}(I) + \frac{6}{9}$, only getting a complete published proof in 2013. Best Fit Decreasing shares the identical $11/9$ asymptotic bound. In practice, on anything resembling a realistic size distribution, FFD tends to land within a bin or two of optimal — the $11/9$ figure is a worst-case guarantee, not a typical outcome.

### Beyond simple greedy: Karmarkar–Karp

None of the algorithms above get *arbitrarily* close to optimal — their guarantees are constant multiplicative factors. Karmarkar and Karp's 1982 algorithm does dramatically better: it solves the LP relaxation of the Gilmore–Gomory cutting-stock formulation and rounds the fractional solution, achieving

$$\mathrm{KK}(I) \le \mathrm{OPT}(I) + O(\log^2 \mathrm{OPT}(I))$$

in polynomial time — an *additive* gap that grows only polylogarithmically, not a multiplicative one. This is what's called an asymptotic fully polynomial-time approximation scheme (AFPTAS); a simpler asymptotic PTAS (without the polylog refinement) was given earlier by de la Vega and Lueker in 1981. It's the closest thing to "solved" that a strongly NP-hard problem is ever going to get.

### Online algorithms: the same problem, but you can't look ahead

Everything above assumes you see the whole item list up front. In the **online** setting, items arrive one at a time and you must place each irrevocably before seeing the next — this is the realistic model for a VM scheduler accepting requests as they come in, and it's a meaningfully harder setting: you can't sort, and you can't undo a bad early decision.

| Result | Bound | Source |
|---|---|---|
| Any online algorithm | competitive ratio $\ge 1.54278$ | Balogh, Békési, Dósa, Epstein, Levin, 2021 |
| Best known online algorithm (Advanced Harmonic) | competitive ratio $\le 1.57829$ | Balogh et al., 2018 |
| Classical Harmonic algorithm | competitive ratio $\to 1.691\ldots$ | Lee & Lee, 1985 |

That gap between 1.54278 and 1.57829 is still open — nobody knows the exact optimal online competitive ratio, which says something about how genuinely subtle the online version is even after four decades of people chipping away at both bounds.

## Special and common cases

"NP-hard" describes the *general* problem. Plenty of instances you'll actually encounter are much easier, and it's worth knowing exactly which structural properties buy you that.

- **Equal-size items.** If every item has identical size $s$, the problem stops being combinatorial entirely: each bin holds exactly $\lfloor C/s \rfloor$ items, so the answer is simply $\left\lceil \dfrac{n}{\lfloor C/s \rfloor} \right\rceil$ — a closed-form expression, computable in $O(1)$ after one division. The entire hardness of bin packing lives in the *variety* of item sizes, not in having many items.
- **Equal bin sizes vs. variable bin sizes.** Everything above assumes uniform capacity $C$. Variable-Sized Bin Packing (bins of several different capacities, choose freely) is a real generalization used in cloud placement (different instance-type sizes), and it inherits the same NP-hardness — but Murgolo (1987) gave an APTAS for it too, so asymptotically it's no worse than the uniform case.
- **Items of exactly half the bin capacity.** If every item is exactly $C/2$, pack two per bin — again trivial. But a *mix* of near-$C/2$ items and small items is precisely the structure behind the classical adversarial constructions used to prove First Fit's and Next Fit's tight bounds: interleave items just over $C/2$ (which can never share a bin with each other) with items that would fit neatly into the slack, but present them in an order that keeps the algorithm from ever pairing them up. That's not a special case that makes the problem *easier* — it's the special case that makes the worst-case bounds *tight*.
- **Everything fits in one bin.** If $\sum_i s_i \le C$, the answer is trivially 1. Always worth checking first; it costs one linear pass.
- **Any single item exceeds $C$.** Infeasible outright — no packing exists, and this needs to be checked before running anything else, since every algorithm above silently assumes $s_i \le C$ for all $i$.
- **Items that evenly divide $C$.** If every item size divides $C$, First Fit-style algorithms tend to reach zero waste, because there's never a "left over but too small to matter" remainder — every bin either fills exactly or has room for another full-size chunk.
- **The 3-PARTITION structure.** Items strictly between $C/4$ and $C/2$, forced into groups of exactly three — this is the case that's *provably* as hard as the general problem gets (strong NP-hardness), not a special case at all in the sense of being easier, but worth knowing by sight, because if your instance happens to have this shape, you should stop looking for a clever polynomial algorithm and reach for backtracking or an ILP solver instead.

## Competitive programming: exact algorithms for small instances

Contest constraints are usually kind enough that you're never actually asked to solve general bin packing — you're asked to solve it for $n \le 20$ or so, where exponential-but-small-base algorithms are completely fine.

**Bitmask DP.** Let $\mathrm{dp}[\mathrm{mask}]$ be the minimum number of bins needed to pack exactly the item subset represented by `mask`. Precompute, for every subset, whether its total size fits in a single bin. Then

$$\mathrm{dp}[\mathrm{mask}] = 1 + \min_{\substack{s \subseteq \mathrm{mask} \\ \text{sum}(s) \le C}} \mathrm{dp}[\mathrm{mask} \setminus s]$$

Naively enumerating submasks of every mask is $O(3^n)$ (the standard "sum over subsets" bound), which is comfortably fast for $n \le 18$–$20$.

```cpp
int dp[1 << 20];
int fits[1 << 20]; // 1 if this subset's total size <= C

int solve(int n) {
    int full = (1 << n) - 1;
    fill(dp, dp + (1 << n), INT_MAX);
    dp[0] = 0;
    for (int mask = 1; mask <= full; mask++) {
        for (int sub = mask; sub; sub = (sub - 1) & mask) {
            if (fits[sub] && dp[mask ^ sub] != INT_MAX) {
                dp[mask] = min(dp[mask], dp[mask ^ sub] + 1);
            }
        }
    }
    return dp[full];
}
```

**DFS with backtracking and pruning.** This is the approach that actually scales past what bitmask DP can reach, and it's the one worth internalizing since the *pruning* is where all the real technique lives. Sort items largest-first (this alone helps prune earlier), then recursively try placing each item into every currently open bin plus one fresh bin. Two prunings matter enormously in practice:

1. **Symmetry breaking.** All *empty* bins are interchangeable — trying an item in empty bin #3 after already trying it in empty bin #2 explores the same structural possibility twice. Never branch into more than one empty bin per item; this alone collapses a huge fraction of the redundant search tree.
2. **Lower-bound pruning.** At any point in the search, if $(\text{bins used so far}) + \left\lceil \dfrac{\text{remaining unplaced size}}{C} \right\rceil \ge (\text{best solution found so far})$, abandon the branch immediately — it can't possibly improve on what you already have.

```cpp
int best;

void dfs(int i, vector<int>& binRemaining, int itemsRemainingSum, int C) {
    if ((int)binRemaining.size() >= best) return; // already worse than best
    int lowerBound = binRemaining.size() + (itemsRemainingSum + C - 1) / C;
    if (lowerBound >= best) return; // can't possibly win from here

    if (i == (int)items.size()) {
        best = min(best, (int)binRemaining.size());
        return;
    }

    for (int b = 0; b < (int)binRemaining.size(); b++) {
        if (binRemaining[b] >= items[i]) {
            binRemaining[b] -= items[i];
            dfs(i + 1, binRemaining, itemsRemainingSum - items[i], C);
            binRemaining[b] += items[i];
        }
        if (binRemaining[b] == C) break; // symmetry break: only try ONE empty bin
    }
    // also try opening a brand new bin
    binRemaining.push_back(C - items[i]);
    dfs(i + 1, binRemaining, itemsRemainingSum - items[i], C);
    binRemaining.pop_back();
}
```

For $n$ up to roughly 30–40 — past what bitmask DP can hold in memory but still too small to trust a bound-and-prune search alone — **meet in the middle** is the other tool worth knowing: split the items into two halves, compute all achievable "bin configurations" for each half independently, then merge.

A couple of real problems to actually implement this against:

- [Codeforces Gym 102770B — Bin Packing Problem](https://codeforces.com/gym/102770/problem/B). The problem stated close to verbatim — good for getting First Fit correct as a baseline before you reach for the exact DFS version above.
- [Codeforces 1066D — Boxes Packing](https://codeforces.com/problemset/problem/1066/D). Not framed as "bin packing" in the title, but it's a Next-Fit-style greedy packing simulation wrapped in a binary-search-on-the-answer outer loop — a good bridge between the online-algorithm theory above and an actual accepted submission.

If you want to sanity-check your own bitmask DP or backtracking implementation, the cleanest self-test is to run it against brute force on small random instances ($n \le 10$) and confirm the bin counts always agree — it's a five-minute script and it'll catch off-by-one errors in the pruning bound immediately.

## Variants, briefly

The 1D case above is the classical version, but the same "pack items into bounded containers" shape generalizes in a few directions worth knowing exist even if this post doesn't go deep on them:

- **Vector bin packing** — items and bins are $d$-dimensional vectors instead of scalars (think CPU *and* memory *and* disk simultaneously), which is the actual model behind real cloud VM placement, not the 1D version.
- **2D and 3D geometric packing** — rectangles or boxes instead of scalar sizes, with or without rotation allowed. Considerably harder to even approximate well than the 1D case.
- **Bin covering** — the dual problem: instead of minimizing bins while respecting a capacity, maximize the number of bins you can fill to at least some threshold. Same flavor of hardness, opposite objective.

## Applications and which algorithm to actually reach for

Kubernetes' bin-packing scheduling strategy is, structurally, First Fit Decreasing on resource vectors — pack pods onto the fewest nodes, biggest resource requests first. Cutting stock in the paper and steel industries runs on Gilmore–Gomory column generation because the instances are large enough and the material cost high enough that a fraction-of-a-percent improvement over FFD is worth the engineering effort. Ad-slot scheduling and container loading both reduce to close variants of the same problem.

For anything you're implementing yourself: **First Fit Decreasing is the correct default.** It's a few lines of code, runs in $O(n \log n)$, and the $11/9$ worst-case bound means you're never more than about 22% off optimal even in an adversarial instance — in practice it's usually far closer than that. Reach for Best Fit instead only if you specifically care about concentrating leftover space (bin-consolidation heuristics sometimes want this). Reach for an online algorithm only when you genuinely can't batch and sort — items truly do arrive one at a time and must be placed immediately. And reach for exact search — bitmask DP or the pruned DFS above — only when $n$ is small enough that "provably optimal" is actually achievable in the time you have.

## Summary

- Bin packing: pack $n$ items of given sizes into the fewest bins of capacity $C$. Decision version (does $k$ bins suffice) is NP-complete; the optimization version is NP-hard.
- The 2-bin case reduces from PARTITION (weakly NP-hard). The general case reduces from 3-PARTITION and is **strongly** NP-hard — no pseudo-polynomial algorithm can exist unless P = NP.
- Next Fit: ratio 2. First Fit / Best Fit: ratio 1.7. First Fit Decreasing / Best Fit Decreasing: tight ratio $11/9 \cdot \mathrm{OPT} + 6/9$. Karmarkar–Karp: $\mathrm{OPT} + O(\log^2 \mathrm{OPT})$, essentially optimal.
- Online bin packing is provably harder: best known algorithm is $1.57829$-competitive, best known lower bound is $1.54278$ — the exact answer is still an open problem.
- Equal-size items, single-bin-suffices, and evenly-divisible-size instances all collapse to easy special cases; the 3-PARTITION structure is exactly the case that stays maximally hard.
- For small $n$, bitmask DP ($O(3^n)$) or a properly pruned DFS (symmetry-broken, lower-bound-pruned) gets you the exact optimum — that pruning is the actual skill, not the recursion itself.
