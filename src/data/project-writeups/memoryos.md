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

```python
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
```

With `RELEVANCE_DECAY_LAMBDA = 0.001` and `SURPRISE_RETENTION_ALPHA = 0.70`,
a maximally-surprising memory (surprise = 1) decays at 0.30 × the base
rate — about **3.3× slower**, matching what the project claims.

## Personalized PageRank spreading activation

Once memories are scored, a small **Personalized PageRank** pass spreads
activation across the entity graph so implicit connections surface too —
an entity that's strongly linked to a highly-relevant one gets a boost even
if it didn't directly match the query:

```python
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
```

`PPR_DAMPING = 0.25`, `PPR_ITERATIONS = 4` — the "4-iteration" pass the
project describes.

## Hebbian co-activation learning

Entities that get retrieved together in the same turn have their graph edge
strengthened — "neurons that fire together, wire together" — so future
retrievals surface related entities as a pair more readily:

```python
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
```

Worth being precise about: only the *strengthening* half is real. The
module docstring also documents a decay formula for unused edges
(`w_{ij}^{t+1} = w_{ij}^{t}·(1−δ_H)`), and its constant (`HEBBIAN_DECAY`)
exists in config — but nothing in the codebase actually calls it. Edges get
stronger; they don't currently get weaker.

## Entity resolution

New information about an existing entity is stitched onto the same graph
node automatically via a Neo4j `MERGE` keyed on name — this part is
genuinely automatic, no LLM involved:

```python
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
```

Merging two *different* names that refer to the same real-world entity
(e.g. "Bob" and "my brother") is a separate path, and it's worth being
precise here too: there's no embedding-similarity or string-distance
dedup algorithm in the codebase. It's exposed as a tool the LLM can call
mid-conversation — the system prompt instructs it to invoke
`merge_entities(canonical, alias)` when it notices a duplicate — so
resolution here is agent-driven, not a standalone deterministic algorithm.
