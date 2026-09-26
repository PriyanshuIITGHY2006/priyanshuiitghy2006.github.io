import { marked, type Tokens } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import { BIN_PACKING_ALGORITHMS, BIN_PACKING_ALGORITHM_LABELS, type BinVizResult } from "./bin-packing";

import cpp from "highlight.js/lib/languages/cpp";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import plaintext from "highlight.js/lib/languages/plaintext";
import latex from "highlight.js/lib/languages/latex";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";

hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c++", cpp);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("text", plaintext);
hljs.registerLanguage("latex", latex);
hljs.registerLanguage("tex", latex);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("java", java);

// ─── Blog post model ────────────────────────────────────────────────────────

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  cover?: string;
  excerpt: string;
  rawBody: string;
  /** Last meaningful revision (frontmatter `updated:`), if any. */
  updated?: string;
  /** Posts sharing a `series:` name are linked together, oldest first. */
  series?: string;
  /** Site-relative path of the typeset PDF (frontmatter `pdf:`), uploaded from admin. */
  pdf?: string;
}

const files = import.meta.glob("/src/data/blogs/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function slugFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/, "");
}

export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw.trim() };
  const [, frontmatter, body] = match;
  const data: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) data[key] = value;
  }
  return { data, body: body.trim() };
}

export const BLOG_POSTS: BlogPost[] = Object.entries(files)
  .map(([path, raw]) => {
    const { data, body } = parseFrontmatter(raw);
    const slug = data.slug || slugFromPath(path);
    return {
      slug,
      title: data.title || slug,
      date: data.date || "",
      tags: data.tags
        ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      cover: data.cover || undefined,
      excerpt: data.excerpt || "",
      rawBody: body,
      updated: data.updated || undefined,
      series: data.series || undefined,
      pdf: data.pdf || undefined,
    };
  })
  .sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : a.date ? -1 : 1));

export function getPost(slug: string | null): BlogPost | undefined {
  if (!slug) return undefined;
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Other posts ranked by shared-tag count (desc), then recency (desc). */
export function getRelatedPosts(current: BlogPost, limit = 2): BlogPost[] {
  const currentTags = new Set(current.tags.map((t) => t.toLowerCase()));
  return BLOG_POSTS.filter((p) => p.slug !== current.slug)
    .map((p) => {
      const overlap = p.tags.reduce((n, t) => n + (currentTags.has(t.toLowerCase()) ? 1 : 0), 0);
      return { post: p, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || (a.post.date < b.post.date ? 1 : -1))
    .slice(0, limit)
    .map((x) => x.post);
}

/** The chronologically previous (older) and next (newer) posts. */
export function getAdjacentPosts(current: BlogPost): { older?: BlogPost; newer?: BlogPost } {
  const i = BLOG_POSTS.findIndex((p) => p.slug === current.slug);
  if (i === -1) return {};
  return { newer: BLOG_POSTS[i - 1], older: BLOG_POSTS[i + 1] };
}

/** Every post in the same series, oldest first. */
export function getSeriesPosts(series: string): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.series === series).reverse();
}

/** All distinct tags across posts, in descending frequency order. */
export function getAllTags(): string[] {
  const counts = new Map<string, number>();
  for (const p of BLOG_POSTS) {
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// ─── Monaco / Code Block Registry ──────────────────────────────────────────

export interface CodeBlockMetadata {
  code: string;
  language: string;
  isRunnable: boolean;
  compilerId: string | null;
  languageLabel: string;
}

export const codeBlocksRegistry = new Map<string, CodeBlockMetadata>();
let codeBlockCounter = 0;

// ─── Test cases (paired with the nearest preceding runnable block) ─────────

export interface TestCase {
  name?: string;
  input?: string;
  expected?: string;
  /** Site-relative paths for cases too big to inline (fetched on demand). */
  inputUrl?: string;
  expectedUrl?: string;
}

/** Keyed by the runnable code block's id (e.g. "code-block-3"). */
export const testcasesRegistry = new Map<string, TestCase[]>();
let lastRunnableBlockId: string | null = null;

export const COMPILER_IDS: Record<string, string> = {
  cpp: "g++-15",
  "c++": "g++-15",
  c: "gcc-15",
  python: "python-3.14",
  py: "python-3.14",
  java: "openjdk-25",
  javascript: "typescript-deno",
  js: "typescript-deno",
  typescript: "typescript-deno",
  ts: "typescript-deno",
  rust: "rust-1.93",
  go: "go-1.26"
};

// ─── Table of contents (h2/h3 headings, slugified) ─────────────────────────

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

const headingSlugCounts = new Map<string, number>();
let currentToc: TocEntry[] = [];
let lastToc: TocEntry[] = [];

function slugifyHeading(text: string): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section";
  const n = (headingSlugCounts.get(base) ?? 0) + 1;
  headingSlugCounts.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

/** Headings from the most recent renderMarkdown() call, in document order. */
export function getLastToc(): TocEntry[] {
  return lastToc;
}

const renderer = new marked.Renderer();

// Regular function (not an arrow) so marked can bind `this.parser` when it
// wraps this method — needed to render inline markdown inside the heading.
renderer.heading = function (this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, { tokens, depth, text }: Tokens.Heading): string {
  const plain = text.replace(/<[^>]*>/g, "");
  const id = slugifyHeading(plain);
  if (depth === 2 || depth === 3) currentToc.push({ id, text: plain, level: depth });
  const inline = this.parser.parseInline(tokens);
  const anchor = depth === 2 || depth === 3
    ? `<a class="blog-heading-anchor" href="#${id}" data-anchor="${id}" aria-label="Copy link to this section"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></a>`
    : "";
  return `<h${depth} id="${id}">${inline}${anchor}</h${depth}>\n`;
};

renderer.code = ({ text, lang }: Tokens.Code): string => {
  const parts = (lang || "").trim().split(/\s+/);
  const language = parts[0] || "";
  const isRunnable = parts.slice(1).includes("runnable");

  let highlighted: string;
  let usedLang = language;
  try {
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(text, { language }).value;
    } else {
      const auto = hljs.highlightAuto(text);
      highlighted = auto.value;
      usedLang = auto.language || "";
    }
  } catch {
    highlighted = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    usedLang = "";
  }
  
  const langLabel = usedLang ? `<span class="blog-code-lang">${usedLang}</span>` : "";
  const compilerId = COMPILER_IDS[language] || null;
  const id = `code-block-${++codeBlockCounter}`;
  
  codeBlocksRegistry.set(id, { 
    code: text, 
    language: usedLang || language, 
    isRunnable, 
    compilerId,
    languageLabel: usedLang || language
  });

  // Calculate approximate editor height dynamically based on lines of code
  const lineCount = text.split('\n').length;
  const editorHeight = Math.min(Math.max(lineCount * 21 + 32, 100), 600); // 21px per line + padding
  
  let runPanel = "";
  const hasRunPanel = Boolean(isRunnable && compilerId);
  if (hasRunPanel) {
    lastRunnableBlockId = id;
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    runPanel = `
      <div class="blog-run-panel" data-run-id="${id}">
        <div class="cf-turnstile" data-sitekey="${siteKey}"></div>
        <div class="blog-run-controls">
          <button type="button" class="blog-run-btn" data-run-action="run" disabled>Run &#9654;</button>
          <span class="blog-run-status"></span>
        </div>
        <details class="blog-run-stdin">
          <summary>stdin (optional)</summary>
          <textarea class="blog-run-stdin-input" rows="3" placeholder="Input for the program, if any"></textarea>
        </details>
        <pre class="blog-run-output" hidden></pre>
      </div>`;
  }

  // When a run panel is attached below, the editor skips its own border/radius —
  // the outer .blog-code-block frame already wraps the whole card, so the two
  // never need to overlap (previously done via a negative-margin hack that could
  // paint over the editor's last line instead of empty space).
  const editorStyle = hasRunPanel
    ? `height: ${editorHeight}px; width: 100%; overflow: hidden; background: #1e1e1e;`
    : `height: ${editorHeight}px; width: 100%; border-radius: 6px; overflow: hidden; border: 1px solid #ddd; background: #1e1e1e;`;

  return `
    <div class="blog-code-block" style="position: relative; margin-bottom: 1.5rem;">
      <div class="blog-code-actions">
        ${langLabel}
        <button type="button" class="blog-code-copy-btn" data-download-code="${id}" aria-label="Download code">Download</button>
        <button type="button" class="blog-code-copy-btn" data-copy-target="${id}" aria-label="Copy code">Copy</button>
      </div>
      <div id="${id}" class="monaco-editor-container" style="${editorStyle}">
        <pre style="margin:0; padding:16px; height:100%; overflow:auto;"><code class="hljs${usedLang ? ` language-${usedLang}` : ""}">${highlighted}</code></pre>
      </div>
      ${runPanel}
    </div>`;
};

// ─── Editorial-style spoiler / hint blocks ──────────────────────────────────
interface SpoilerToken extends Tokens.Generic {
  type: "spoiler";
  title: string;
  text: string;
  tokens: Tokens.Generic[];
}

const spoilerExtension = {
  name: "spoiler",
  level: "block" as const,
  start(src: string): number | undefined {
    const idx = src.indexOf(":::spoiler");
    return idx === -1 ? undefined : idx;
  },
  tokenizer(this: { lexer: { blockTokens: (s: string, t: Tokens.Generic[]) => void } }, src: string) {
    const match = /^:::spoiler([^\n]*)\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
    if (!match) return undefined;
    const token: SpoilerToken = {
      type: "spoiler",
      raw: match[0],
      title: match[1].trim() || "Hint",
      text: match[2],
      tokens: [],
    };
    this.lexer.blockTokens(token.text, token.tokens);
    return token;
  },
  renderer(this: { parser: { parse: (t: Tokens.Generic[]) => string } }, token: Tokens.Generic): string {
    const t = token as SpoilerToken;
    const body = this.parser.parse(t.tokens);
    return `<details class="blog-spoiler"><summary>${t.title}</summary><div class="blog-spoiler-body">${body}</div></details>`;
  },
};

// ─── Callouts: :::note / :::tip / :::warning / :::important ─────────────────
const CALLOUT_KINDS = ["note", "tip", "warning", "important"] as const;
type CalloutKind = (typeof CALLOUT_KINDS)[number];

interface CalloutToken extends Tokens.Generic {
  type: "callout";
  kind: CalloutKind;
  title: string;
  tokens: Tokens.Generic[];
}

const calloutExtension = {
  name: "callout",
  level: "block" as const,
  start(src: string): number | undefined {
    const m = /:::(?:note|tip|warning|important)\b/.exec(src);
    return m ? m.index : undefined;
  },
  tokenizer(this: { lexer: { blockTokens: (s: string, t: Tokens.Generic[]) => void } }, src: string) {
    const match = /^:::(note|tip|warning|important)\b([^\n]*)\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
    if (!match) return undefined;
    const kind = match[1] as CalloutKind;
    const token: CalloutToken = {
      type: "callout",
      raw: match[0],
      kind,
      title: match[2].trim() || kind[0].toUpperCase() + kind.slice(1),
      tokens: [],
    };
    this.lexer.blockTokens(match[3], token.tokens);
    return token;
  },
  renderer(this: { parser: { parse: (t: Tokens.Generic[]) => string } }, token: Tokens.Generic): string {
    const t = token as CalloutToken;
    return `<div class="blog-callout blog-callout-${t.kind}"><p class="blog-callout-title">${esc(t.title)}</p>${this.parser.parse(t.tokens)}</div>`;
  },
};

// ─── Tabs: several code blocks shown one at a time ──────────────────────────
// :::tabs wrapping fenced blocks; each tab is labelled by `label=Name` in the
// fence info string, else by the language (```py label=Brute force).
const LANG_LABELS: Record<string, string> = {
  cpp: "C++", "c++": "C++", c: "C", python: "Python", py: "Python", java: "Java",
  javascript: "JavaScript", js: "JavaScript", typescript: "TypeScript", ts: "TypeScript",
  rust: "Rust", go: "Go", bash: "Bash", sh: "Shell", sql: "SQL",
};

interface TabsToken extends Tokens.Generic {
  type: "tabs";
  tokens: Tokens.Generic[];
}

let tabsCounter = 0;

const tabsExtension = {
  name: "tabs",
  level: "block" as const,
  start(src: string): number | undefined {
    const idx = src.indexOf(":::tabs");
    return idx === -1 ? undefined : idx;
  },
  tokenizer(this: { lexer: { blockTokens: (s: string, t: Tokens.Generic[]) => void } }, src: string) {
    const match = /^:::tabs[ \t]*\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
    if (!match) return undefined;
    const token: TabsToken = { type: "tabs", raw: match[0], tokens: [] };
    this.lexer.blockTokens(match[1], token.tokens);
    return token;
  },
  renderer(this: { parser: { parse: (t: Tokens.Generic[]) => string } }, token: Tokens.Generic): string {
    const t = token as TabsToken;
    const blocks = t.tokens.filter((tok) => tok.type === "code") as Tokens.Code[];
    if (!blocks.length) return this.parser.parse(t.tokens);
    const group = `tabs-${++tabsCounter}`;
    const labels = blocks.map((b) => {
      const parts = (b.lang || "").trim().split(/\s+/);
      const custom = parts.find((x) => x.startsWith("label="));
      return custom ? custom.slice(6).replace(/_/g, " ") : LANG_LABELS[parts[0]?.toLowerCase()] ?? (parts[0] || "Code");
    });
    const bar = labels
      .map((l, i) => `<button type="button" class="blog-tab${i === 0 ? " active" : ""}" data-tab-group="${group}" data-tab-index="${i}" data-tab-label="${esc(l)}">${esc(l)}</button>`)
      .join("");
    const panels = blocks
      .map((b, i) => `<div class="blog-tab-panel" data-tab-panel="${i}"${i === 0 ? "" : " hidden"}>${this.parser.parse([b as unknown as Tokens.Generic])}</div>`)
      .join("");
    return `<div class="blog-tabs" id="${group}"><div class="blog-tabs-bar">${bar}</div>${panels}</div>`;
  },
};

// ─── Problem card ───────────────────────────────────────────────────────────
// :::problem with `key: value` lines — title, url, source, rating, tags, limits.
interface ProblemToken extends Tokens.Generic {
  type: "problem";
  fields: Record<string, string>;
}

const problemExtension = {
  name: "problem",
  level: "block" as const,
  start(src: string): number | undefined {
    const idx = src.indexOf(":::problem");
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const match = /^:::problem[ \t]*\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
    if (!match) return undefined;
    const fields: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) fields[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }
    const token: ProblemToken = { type: "problem", raw: match[0], fields };
    return token;
  },
  renderer(token: Tokens.Generic): string {
    const f = (token as ProblemToken).fields;
    const url = /^https?:\/\//.test(f.url ?? "") ? f.url : "";
    const title = esc(f.title || "Problem");
    const tags = (f.tags ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const meta = [f.source, f.limits].filter(Boolean).map((m) => `<span>${esc(m!)}</span>`).join("");
    return `
      <div class="blog-problem">
        <div class="blog-problem-head">
          ${url ? `<a class="blog-problem-title" href="${esc(url)}" target="_blank" rel="noopener">${title}</a>` : `<span class="blog-problem-title">${title}</span>`}
          ${f.rating ? `<span class="blog-problem-rating">${esc(f.rating)}</span>` : ""}
        </div>
        ${meta ? `<div class="blog-problem-meta">${meta}</div>` : ""}
        ${tags.length ? `<div class="blog-problem-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
      </div>`;
  },
};

// ─── Test-case panels ─────────────────────────────────────────────────────────
// A `:::testcases` block must come right after a ```lang runnable``` block.
// Its body is a JSON array of { name?, input, expected }. Rendered as a panel
// with a "Run all tests" button that executes the paired editor's current
// code once per case and diffs stdout against `expected` (trimmed).
interface TestcasesToken extends Tokens.Generic {
  type: "testcases";
  json: string;
}

const testcasesExtension = {
  name: "testcases",
  level: "block" as const,
  start(src: string): number | undefined {
    const idx = src.indexOf(":::testcases");
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const match = /^:::testcases\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
    if (!match) return undefined;
    const token: TestcasesToken = { type: "testcases", raw: match[0], json: match[1] };
    return token;
  },
  renderer(token: Tokens.Generic): string {
    const t = token as TestcasesToken;
    const runId = lastRunnableBlockId;
    if (!runId) {
      return `<p class="blog-testcases-error">No runnable code block found for this test-case panel.</p>`;
    }
    let cases: TestCase[];
    try {
      cases = JSON.parse(t.json);
      if (!Array.isArray(cases)) throw new Error("not an array");
    } catch {
      return `<p class="blog-testcases-error">Could not parse test cases (invalid JSON).</p>`;
    }
    testcasesRegistry.set(runId, cases);

    // Row bodies (input/expected previews, downloads) are filled in at
    // mount time by wireTestcases, straight from testcasesRegistry.
    const rows = cases
      .map(
        (c, i) => `
      <details class="blog-testcase-row" data-tc-index="${i}">
        <summary class="blog-testcase-summary">
          <span class="blog-testcase-name">${esc(c.name || `Test ${i + 1}`)}</span>
          <span class="blog-testcase-status" data-tc-status>not run</span>
          <button type="button" class="blog-tc-link blog-tc-run-one" data-tc-run-one disabled>Run</button>
        </summary>
        <div class="blog-testcase-body" data-tc-body></div>
      </details>`,
      )
      .join("");

    return `
      <div class="blog-testcases-panel" data-testcases-for="${runId}">
        <div class="blog-testcases-head">
          <span class="blog-testcases-title">Test cases (${cases.length})</span>
          <span class="blog-testcases-actions">
            <button type="button" class="blog-testcases-run-btn" data-tc-download-all>Download all (.zip)</button>
            <button type="button" class="blog-testcases-run-btn" data-tc-run disabled>Run all tests</button>
          </span>
        </div>
        <div class="blog-testcases-list">${rows}</div>
      </div>`;
  },
};

// ─── Bin-packing algorithm visualizations ──────────────────────────────────
// :::binviz
// algorithm: first-fit
// capacity: 10
// items: 4,8,1,4,2,1,7,3
// caption: First Fit packing items into bins of capacity 10
// :::
// The simulation runs once at render time (deterministic, cheap); the DOM
// wiring in blog-post.ts replays it step by step against this registry.
export interface BinVizConfig {
  algorithm: string;
  algorithmLabel: string;
  capacity: number;
  items: number[];
  caption: string;
  result: BinVizResult;
}

export const binVizRegistry = new Map<string, BinVizConfig>();
let binVizCounter = 0;

interface BinVizToken extends Tokens.Generic {
  type: "binviz";
  body: string;
}

const binVizExtension = {
  name: "binviz",
  level: "block" as const,
  start(src: string): number | undefined {
    const idx = src.indexOf(":::binviz");
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const match = /^:::binviz\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
    if (!match) return undefined;
    const token: BinVizToken = { type: "binviz", raw: match[0], body: match[1] };
    return token;
  },
  renderer(token: Tokens.Generic): string {
    const t = token as BinVizToken;
    const data: Record<string, string> = {};
    for (const line of t.body.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    const algorithm = data.algorithm || "first-fit";
    const capacity = Number(data.capacity) || 10;
    const items = (data.items || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    const caption = data.caption || "";
    const algoFn = BIN_PACKING_ALGORITHMS[algorithm];

    if (!algoFn || items.length === 0) {
      return `<p class="blog-testcases-error">Could not render bin-packing visualization (bad :::binviz config).</p>`;
    }

    const result = algoFn(items, capacity);
    const id = `binviz-${++binVizCounter}`;
    binVizRegistry.set(id, {
      algorithm,
      algorithmLabel: BIN_PACKING_ALGORITHM_LABELS[algorithm] || algorithm,
      capacity,
      items,
      caption,
      result,
    });

    return `
      <figure class="blog-binviz" id="${id}">
        <div class="blog-binviz-canvas" data-binviz-canvas></div>
        <div class="blog-binviz-controls">
          <button type="button" class="blog-binviz-btn" data-binviz-action="step">Step</button>
          <button type="button" class="blog-binviz-btn" data-binviz-action="play">Play &#9656;</button>
          <button type="button" class="blog-binviz-btn" data-binviz-action="reset">Reset</button>
          <span class="blog-binviz-status" data-binviz-status></span>
        </div>
        ${caption ? `<figcaption class="blog-binviz-caption">${esc(caption)}</figcaption>` : ""}
      </figure>`;
  },
};

// ─── Video embeds ────────────────────────────────────────────────────────────
interface VideoToken extends Tokens.Generic {
  type: "youtube";
  videoId: string;
}

let videoEmbedCounter = 0;

function extractYouTubeId(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : trimmed;
}

const youtubeExtension = {
  name: "youtube",
  level: "block" as const,
  start(src: string): number | undefined {
    const idx = src.indexOf(":::youtube");
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const match = /^:::youtube[ \t]+(\S+)[ \t]*\n?:::(?:\n|$)/.exec(src);
    if (!match) return undefined;
    const token: VideoToken = { type: "youtube", raw: match[0], videoId: extractYouTubeId(match[1]) };
    return token;
  },
  renderer(token: Tokens.Generic): string {
    const t = token as VideoToken;
    videoEmbedCounter += 1;
    const playerId = `blog-yt-player-${videoEmbedCounter}`;
    return `<div class="blog-video-embed"><iframe id="${playerId}" src="https://www.youtube-nocookie.com/embed/${t.videoId}?enablejsapi=1" title="Embedded video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><button type="button" class="blog-video-close" aria-label="Close floating video">&times;</button></div>`;
  },
};

marked.use({ renderer, breaks: false, gfm: true, extensions: [spoilerExtension, calloutExtension, tabsExtension, problemExtension, youtubeExtension, testcasesExtension, binVizExtension] });
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

export function renderMarkdown(md: string): string {
  lastRunnableBlockId = null;
  tabsCounter = 0;
  headingSlugCounts.clear();
  currentToc = [];
  const html = marked.parse(md, { async: false }) as string;
  lastToc = currentToc;
  return DOMPurify.sanitize(html, {
    // semantics/annotation keep KaTeX's LaTeX source (used by click-to-copy).
    ADD_TAGS: ["span", "iframe", "button", "textarea", "details", "summary", "div", "figure", "figcaption", "semantics", "annotation"],
    ADD_ATTR: [
      "target", "rel", "class", "id", "style", // id and style added to allow Monaco sizing
      "src", "title", "loading", "referrerpolicy", "allow", "allowfullscreen", "frameborder",
      "rows", "placeholder", "hidden", "type", "open",
      "data-run-id", "data-run-action", "data-sitekey", // Data attributes explicitly allowed
      "data-copy-target", "data-testcases-for", "data-tc-run", "data-tc-index", "data-tc-status", "disabled",
      "encoding", "data-download-code", "data-anchor", "data-tc-run-one", "data-tab-group", "data-tab-index", "data-tab-label", "data-tab-panel", "data-tc-body", "data-tc-download-all", "href", "aria-label",
      "data-binviz-canvas", "data-binviz-action", "data-binviz-status",
    ],
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  });
}

export function formatBlogDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function estimateReadingMinutes(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/:::[a-z]+[^\n]*\n[\s\S]*?\n:::/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
