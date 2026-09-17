## What it does

Competitive programmers accumulate hundreds of solved problems that
usually just rot in scattered local files. This archiver talks to the
**Codeforces REST API**, pulls every Accepted C++ submission, and turns
them into a structured, browsable, self-updating repository — matching any
locally-kept `.cpp` solution to its problem automatically by filename.

## Talking to the Codeforces API

A single paginated call to `user.status` returns every submission ever
made; the archiver filters down to unique, Accepted, C++ problems (keeping
only the first AC per problem, since re-solving the same problem twice
shouldn't produce two entries):

```python
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
```

## Matching local solutions to problems

Before writing anything, the script scans the `solutions/` folder for any
`.cpp` files the user has dropped in by hand, keyed by the contest+index
prefix in the filename (e.g. `1097B.cpp`):

```python
def load_user_solutions():
    """Load all .cpp files from solutions/ folder, keyed by problem ID."""
    SOLUTIONS_DIR.mkdir(exist_ok=True)
    user_code = {}
    for f in SOLUTIONS_DIR.glob("*.cpp"):
        m = re.match(r'^(\d+[A-Za-z]\d*)', f.name)
        if m:
            user_code[m.group(1)] = f.read_text(encoding="utf-8", errors="replace")
    return user_code
```

## Writing the archive

For every submission, a folder gets created under `problems/<rating>/`
with a generated README (problem name, rating, tags, submission link) and
either the real solution or a placeholder pointing back to Codeforces if no
local code exists yet:

```python
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
        f"# {contest_id}{index} - {name}\n",
        f"**Contest:** [{contest_id}](https://codeforces.com/contest/{contest_id})\n",
        f"**Problem:** [{index}](https://codeforces.com/contest/{contest_id}/problem/{index})\n",
        f"**Rating:** {rating if rating else 'Unrated'}\n",
        f"**Tags:** {', '.join(f'`{t}`' for t in tags) if tags else 'None'}\n",
        f"**Language:** {sub.get('programmingLanguage', 'C++')}\n",
        f"**Submission:** [Link](https://codeforces.com/contest/{contest_id}/submission/{sub['id']})\n",
    ]
    (prob_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")

    code = user_code.get(key)
    if code:
        (prob_dir / "solution.cpp").write_text(code, encoding="utf-8")
    else:
        placeholder = (
            f"// Problem: {contest_id}{index} - {name}\n"
            f"// Submission: https://codeforces.com/contest/{contest_id}/submission/{sub['id']}\n"
            f"//\n"
            f"// Drop {key}.cpp into the solutions/ folder and push to add your code here.\n"
        )
        sol_path = prob_dir / "solution.cpp"
        if not sol_path.exists() or sol_path.read_text().startswith("// Problem:"):
            sol_path.write_text(placeholder, encoding="utf-8")
```

## Building the index

A top-level README is regenerated on every run: every problem in a sorted
table, plus a tag-distribution and rating-distribution breakdown, so the
archive doubles as a personal analytics dashboard of what's actually been
practiced:

```python
def generate_index(all_subs, user_code):
    total = len(all_subs)
    with_code = sum(1 for s in all_subs
                    if f"{s['problem'].get('contestId',0)}{s['problem'].get('index','')}" in user_code)

    lines = [
        f"# Codeforces Solutions Archive\n",
        f"**Handle:** [{CF_HANDLE}](https://codeforces.com/profile/{CF_HANDLE})\n",
        f"**Total Problems:** {total}\n",
        f"**With Source Code:** {with_code} / {total}\n",
    ]

    tag_count = {}
    for s in all_subs:
        for t in s["problem"].get("tags", []):
            tag_count[t] = tag_count.get(t, 0) + 1
    lines.append("\n## Tag Distribution\n")
    for tag, count in sorted(tag_count.items(), key=lambda x: -x[1]):
        lines.append(f"| `{tag}` | {count} |")

    (REPO_ROOT / "README.md").write_text("\n".join(lines), encoding="utf-8")
```
