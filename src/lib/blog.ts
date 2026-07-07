import { marked, type Tokens } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";

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
  /** URL slug — derived from the frontmatter `slug` field, else the filename. */
  slug: string;
  title: string;
  /** ISO date string, e.g. "2026-07-04". */
  date: string;
  tags: string[];
  /** Path under /public, e.g. "blogs/my-post/cover.jpg". Optional. */
  cover?: string;
  excerpt: string;
  /** Raw Markdown body (frontmatter stripped). */
  rawBody: string;
}

// ─── Load every Markdown file in src/data/blogs/ at build time ─────────────
const files = import.meta.glob("/src/data/blogs/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function slugFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/, "");
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
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
    };
  })
  // Newest first; posts without a date sink to the bottom.
  .sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : a.date ? -1 : 1));

export function getPost(slug: string | null): BlogPost | undefined {
  if (!slug) return undefined;
  return BLOG_POSTS.find((p) => p.slug === slug);
}

// ─── Markdown → sanitized, syntax-highlighted HTML ──────────────────────────

// Fenced blocks tagged "runnable" (e.g. ```cpp runnable) get a Run button.
// The source text is kept in this registry, keyed by a generated id, rather
// than serialized into an HTML attribute — that avoids any escaping issues
// with quotes/angle brackets inside real source code.
// In src/lib/blog.ts

export interface RunnableBlock {
  code: string;
  compilerId: string; // Changed from languageId: number
  languageLabel: string;
}
export const runnableBlocks = new Map<string, RunnableBlock>();
let runnableCounter = 0;

export function getRunnableBlock(id: string): RunnableBlock | undefined {
  return runnableBlocks.get(id);
}

// Map markdown language tags to OnlineCompiler string IDs
const COMPILER_IDS: Record<string, string> = {
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

const renderer = new marked.Renderer();

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

  // Inside renderer.code in src/lib/blog.ts ...
  
let runPanel = "";
  const compilerId = COMPILER_IDS[language];
  if (isRunnable && compilerId) {
    const id = `run-${++runnableCounter}`;
    runnableBlocks.set(id, { code: text, compilerId: compilerId, languageLabel: usedLang || language });
    
    // We inject the Turnstile site key from your environment variables
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    
    runPanel = `
      <div class="blog-run-panel" data-run-id="${id}">
        <!-- Cloudflare Turnstile Anti-Bot Widget -->
        <div class="cf-turnstile" data-sitekey="${siteKey}"></div>

        <div class="blog-run-controls">
          <!-- Button is disabled by default until the Turnstile green tick appears -->
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

  return `<div class="blog-code-block">${langLabel}<pre><code class="hljs${usedLang ? ` language-${usedLang}` : ""}">${highlighted}</code></pre></div>${runPanel}`;
};

// ─── Editorial-style spoiler / hint blocks ──────────────────────────────────
// :::spoiler Hint 1
// Markdown content, rendered as usual, hidden behind a native <details>.
// :::
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

// ─── Video embeds ────────────────────────────────────────────────────────────
// :::youtube dQw4w9WgXcQ         (or a full youtube.com/youtu.be URL)
// :::
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

marked.use({ renderer, breaks: false, gfm: true, extensions: [spoilerExtension, youtubeExtension] });
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    // This content is authored solely by the site owner via files in
    // src/data/blogs/ — never from user input (comments go through esc(),
    // not this function) — so allowing iframe embeds here is safe.
    ADD_TAGS: ["span", "iframe", "button", "textarea", "details", "summary"],
    ADD_ATTR: [
      "target", "rel", "class",
      "src", "title", "loading", "referrerpolicy", "allow", "allowfullscreen", "frameborder",
      "rows", "placeholder", "hidden", "type", "open",
    ],
    // KaTeX renders to a mix of HTML, MathML, and SVG (for radicals, etc.) —
    // these profiles let that markup through while DOMPurify still strips
    // scripts, event handlers, and anything unsafe.
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  });
}

export function formatBlogDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Rough reading time, similar to Medium's estimate (~200 words/minute). */
export function estimateReadingMinutes(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/:::[a-z]+[^\n]*\n[\s\S]*?\n:::/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
