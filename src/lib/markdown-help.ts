// Shared "how do I write this" reference for the two admin markdown
// editors (blog posts, project write-ups). Documents only what
// src/lib/blog.ts actually implements — nothing aspirational. If you add
// or remove a marked extension there, update this alongside it.

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function example(code: string): string {
  return `<pre class="admin-help-example"><code>${esc(code)}</code></pre>`;
}

const FRONTMATTER_SECTION = `
  <div class="admin-help-section">
    <h4>Frontmatter (top of the file, blog posts only)</h4>
    <p>Five plain <code>key: value</code> lines between two <code>---</code> markers. Only <code>title</code> and <code>date</code> are required.</p>
    ${example(`---
title: Why My Cache Keeps Missing
date: 2026-09-17
tags: C++, Performance, Data Structures
cover: gallery-media/my-cover.png
excerpt: One or two sentences shown on the blog list card.
---

Post body starts here.`)}
    <p>Set <code>cover</code> to a path an uploaded image actually lives at (pick it from the cover dropdown instead of typing it by hand).</p>
  </div>`;

const NO_FRONTMATTER_SECTION = `
  <div class="admin-help-section">
    <h4>No frontmatter here</h4>
    <p>A project write-up file is <b>just the markdown body</b> — no <code>---</code> block. Title, date, stack, tagline, highlights, and links are all edited above this box and saved straight to the database; only the long-form write-up itself gets published to GitHub.</p>
  </div>`;

function commonSections(): string {
  return `
  <div class="admin-help-section">
    <h4>Basic Markdown (GFM)</h4>
    <p>Standard GitHub-flavored Markdown: <code>**bold**</code>, <code>*italic*</code>, <code>- list item</code>, <code>1. numbered</code>, <code>&gt; blockquote</code>, tables, <code>[link text](https://...)</code>, <code>![alt text](path/to/image.png)</code>, and horizontal rules (<code>---</code> on its own line).</p>
  </div>

  <div class="admin-help-section">
    <h4>Headings &amp; table of contents</h4>
    <p><code>##</code> and <code>###</code> headings are auto-slugified and picked up by the post's table of contents. <code>#</code> (h1) is not — the post title already fills that role.</p>
    ${example(`## A section heading

### A subsection`)}
  </div>

  <div class="admin-help-section">
    <h4>Code blocks</h4>
    <p>Fenced with a language tag for syntax highlighting: <code>cpp</code>, <code>python</code>/<code>py</code>, <code>javascript</code>/<code>js</code>, <code>typescript</code>/<code>ts</code>, <code>bash</code>/<code>sh</code>, <code>json</code>, <code>sql</code>, <code>java</code>, <code>html</code>, <code>css</code>, <code>latex</code>, <code>plaintext</code>. Anything else falls back to auto-detection.</p>
    ${example('```cpp\nint main() { return 0; }\n```')}
    <p>Add <code> runnable</code> after the language to get an in-browser Run button (compiles and executes for real). Supported runnable languages: cpp/c++, c, python/py, java, javascript/js, typescript/ts, rust, go.</p>
    ${example('```cpp runnable\nint main() { return 0; }\n```')}
  </div>

  <div class="admin-help-section">
    <h4>Test cases</h4>
    <p>Immediately after a <code>runnable</code> code block, a <code>:::testcases</code> block adds a "Run all tests" panel. Body is a JSON array of <code>{ name?, input, expected }</code> — stdout is diffed against <code>expected</code> (trimmed) after feeding <code>input</code> to stdin.</p>
    ${example(':::testcases\n[\n  { "name": "basic", "input": "3\\n1 2 3", "expected": "6" }\n]\n:::')}
  </div>

  <div class="admin-help-section">
    <h4>Math (KaTeX)</h4>
    <p>Inline: <code>$e^{i\\pi} + 1 = 0$</code>. Block, on its own line: <code>$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$</code>.</p>
  </div>

  <div class="admin-help-section">
    <h4>Spoiler / hint block</h4>
    <p>Collapsed by default, click to expand. Title is optional (defaults to "Hint").</p>
    ${example(':::spoiler Click for the answer\nThe answer is 42.\n:::')}
  </div>

  <div class="admin-help-section">
    <h4>YouTube embed</h4>
    <p>Full URL or bare video ID both work.</p>
    ${example(':::youtube https://youtu.be/dQw4w9WgXcQ\n:::')}
  </div>

  <div class="admin-help-section">
    <h4>Bin-packing visualization</h4>
    <p>Renders a step-through animation of a bin-packing algorithm (Step / Play / Reset controls).</p>
    ${example(':::binviz\nalgorithm: first-fit\ncapacity: 10\nitems: 4,8,1,4,2,1,7,3\ncaption: First Fit packing items into bins of capacity 10\n:::')}
  </div>

  <div class="admin-help-section">
    <h4>Images</h4>
    <p>Upload via the Images tab (or the inline "Upload new…" button where available) first, then reference the path it gives you, relative to the site root — e.g. <code>![Diagram](gallery-media/diagram.png)</code>.</p>
  </div>`;
}

export function renderMarkdownHelp(kind: "blog" | "project"): string {
  return `
    <details class="admin-help">
      <summary>Markdown writing guide</summary>
      <div class="admin-help-body">
        ${kind === "blog" ? FRONTMATTER_SECTION : NO_FRONTMATTER_SECTION}
        ${commonSections()}
      </div>
    </details>`;
}
