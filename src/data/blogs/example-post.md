---
title: Writing Your First Post
date: 2026-07-04
tags: Meta, Guide
excerpt: How this blog works — front matter fields, images, and code blocks — and how to publish a new post.
---

This is a starter post that doubles as documentation. Delete it once you have
real posts published, or keep it around as a reference for the front matter
format.

## Front matter

Every post is a single Markdown file in `src/data/blogs/`. The filename
becomes the URL slug (e.g. `example-post.md` → `#/blog?slug=example-post`),
unless you set `slug:` explicitly in the front matter. The block between the
`---` fences at the top of the file is read as `key: value` pairs:

```yaml
title: Writing Your First Post
date: 2026-07-04
tags: Meta, Guide
cover: blogs/example-post/cover.jpg
excerpt: A one-line summary shown on the blog list page.
```

`tags` is a comma-separated list. `cover` and `excerpt` are optional.

## Images

Drop image files into `public/blogs/<post-slug>/` and reference them with a
path relative to `public/`, the same way the gallery does it:

```markdown
![A diagram of the pipeline](blogs/example-post/diagram.png)
```

## Code rendering

Fenced code blocks are syntax-highlighted automatically — just tag the
language after the triple backticks:

```cpp
#include <bits/stdc++.h>
using namespace std;

// Fenwick tree over coordinate-compressed values.
struct Fenwick {
    vector<int> tree;
    explicit Fenwick(int n) : tree(n + 1, 0) {}

    void update(int i, int delta) {
        for (++i; i < (int)tree.size(); i += i & (-i))
            tree[i] += delta;
    }

    int query(int i) const {
        int sum = 0;
        for (++i; i > 0; i -= i & (-i))
            sum += tree[i];
        return sum;
    }
};
```

```python
def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
```

Inline code like `O(log n)` works too, along with regular **bold**, *italics*,
[links](https://priyanshuiitghy2006.github.io/), blockquotes, and tables.

> Trapping Acid Rain Water was the hardest problem I've set so far — the DP
> transition needed CDQ divide and conquer stacked on top of the convex hull
> trick.

## Publishing

Add the `.md` file, commit, and push — GitHub Pages rebuilds the site and the
post appears on `#/blogs` automatically, newest first by `date`.
