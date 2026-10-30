// Live preview for the post editor: Markdown, KaTeX, footnotes and code
// blocks with the site's file names, line numbers, highlights and diffs.
// Hugo shortcodes are drawn as labelled boxes. It shows structure, not the
// exact site styling; the real page is what Hugo builds after a publish.

import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import markedFootnote from "marked-footnote";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { replaceShortcodes, type Shortcode } from "./shortcodes";
import { preprocess, extrasExtension } from "./extras";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/** "2 4-6" or "2,4-6" → {2,4,5,6}, like layouts/_partials/line-set.html. */
function lineSet(spec: string | undefined): Set<number> {
  const out = new Set<number>();
  for (const part of (spec ?? "").split(/[\s,]+/).filter(Boolean)) {
    const [a, b] = part.split("-").map(Number);
    for (let i = a; i <= (b || a); i++) out.add(i);
  }
  return out;
}

// Same markers as layouts/_partials/code-block.html.
const MARKER = /\s*(?:\/\*|\/\/|#|--|;|<!--)?\s*\[!code\s+(\+\+|--|highlight|hl|word:[^\]\s]+)\s*\](?:\s*\*\/|\s*-->)?\s*$/;

function codeBlock(text: string, info: string): string {
  const [language = "", ...rest] = info.trim().split(/\s+/);
  const attrs = Object.fromEntries([...rest.join(" ").matchAll(/(\w+)=(?:"([^"]*)"|(\S+?))(?=[\s}]|$)/g)].map((m) => [m[1], m[2] ?? m[3]]));
  const hl = lineSet(attrs.hl), add = lineSet(attrs.add), del = lineSet(attrs.del);
  const words: string[] = [];
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const m = raw.match(MARKER);
    if (!m) { lines.push(raw); continue; }
    const rest = raw.replace(MARKER, "");
    if (m[1].startsWith("word:")) {
      words.push(m[1].slice(5));
      if (rest.trim()) lines.push(rest);
      continue;
    }
    lines.push(rest);
    const n = lines.length;
    if (m[1] === "++") add.add(n);
    else if (m[1] === "--") del.add(n);
    else hl.add(n);
  }
  const numbered = attrs.numbers === "true";
  const body = lines.map((line, i) => {
    const n = i + 1;
    let html = esc(line);
    for (const w of words) html = html.split(esc(w)).join(`<mark>${esc(w)}</mark>`);
    const cls = [hl.has(n) && "hl", add.has(n) && "add", del.has(n) && "del"].filter(Boolean).join(" ");
    const gutter = add.has(n) ? "+" : del.has(n) ? "-" : numbered ? String(n) : "";
    return `<span class="ln ${cls}">${numbered || add.size || del.size ? `<span class="gutter">${gutter}</span>` : ""}${html || " "}</span>`;
  }).join("");
  const title = attrs.title ? `<figcaption>${esc(attrs.title)}</figcaption>` : "";
  return `<figure class="pv-code">${title}<pre><code${language ? ` data-lang="${esc(language)}"` : ""}>${body}</code></pre></figure>`;
}

const md = new Marked({ gfm: true });
md.use(markedKatex({ throwOnError: false, nonStandard: true }));
md.use(markedFootnote());
md.use(extrasExtension);
md.use({
  renderer: {
    code({ text, lang }) {
      // Drawn by hydrateMermaid() after the preview is on the page.
      if ((lang ?? "").trim().split(/\s+/)[0] === "mermaid") return `<pre class="pv-mermaid">${esc(text)}</pre>`;
      return codeBlock(text, lang ?? "");
    },
    image({ href, title, text }) {
      // Post images are written relative to the site root (gallery-media/x.png).
      const src = /^([a-z]+:|\/)/i.test(href) ? href : `/${href}`;
      return `<img src="${esc(src)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} loading="lazy">`;
    },
  },
});

/** A path as written in a post (gallery-media/x.mp4) → a URL that works from /admin/. */
function siteUrl(src: string | undefined): string {
  if (!src) return "";
  return /^([a-z]+:|\/)/i.test(src) ? src : `/${src}`;
}

/** Hugo's "linenos=table,hl_lines=2 4-6" highlight options → code-block attributes. */
function highlightInfo(lang: string, opts: string | undefined): string {
  const o = Object.fromEntries((opts ?? "").split(",").map((kv) => kv.split("=").map((x) => x.trim())));
  return [lang, o.linenos && o.linenos !== "false" ? "numbers=true" : "", o.hl_lines ? `hl="${o.hl_lines}"` : ""].join(" ");
}

// Shortcodes that sit inside a sentence rather than on their own line.
const INLINE_SHORTCODES = new Set(["ref", "relref", "param", "inTextImg"]);

function box(label: string, detail: string, body = ""): string {
  return `<div class="pv-sc"><div class="pv-sc-head"><b>${esc(label)}</b>${detail ? ` ${esc(detail)}` : ""}</div>${body}</div>`;
}

function renderShortcode(sc: Shortcode): string {
  const p = sc.params;
  const inner = sc.inner !== undefined ? render(sc.inner) : "";
  switch (sc.name) {
    case "collapse":
      return `<details class="pv-collapse" open><summary>${esc(p.summary ?? "Details")}</summary>${inner}</details>`;
    case "callout":
      return `<div class="pv-sc pv-callout-${esc(p.type ?? "note")}"><div class="pv-sc-head"><b>${esc(p.title || (p.type ?? "note").toUpperCase())}</b></div>${inner}</div>`;
    case "problem":
      return box(p.title ?? "Problem", [p.source, p.rating && `Rating ${p.rating}`, p.limits, p.tags].filter(Boolean).join(" · "));
    case "youtube": {
      const id = p.id ?? p["0"] ?? "";
      return box("YouTube", "", id ? `<a href="https://youtu.be/${esc(id)}" target="_blank" rel="noopener"><img class="pv-yt" src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="Video ${esc(id)}"></a>` : "");
    }
    case "diagram":
      return box("Diagram", `${p.name ?? ""}${p.caption ? `: ${p.caption}` : ""}`);
    case "repo-card":
      return box("Repo card", [p.repo, p.title, p.desc].filter(Boolean).join(" · "));
    case "repo-code": {
      // Filled in by hydrateRepoCode() once the file has been fetched.
      const url = `https://raw.githubusercontent.com/${p.repo}/${p.ref || "HEAD"}/${p.path}`;
      return `<div class="pv-repo-code" data-url="${esc(url)}" data-params="${esc(JSON.stringify(p))}">${box("Code from GitHub", `${p.repo ?? ""}/${p.path ?? ""}: loading…`)}</div>`;
    }
    case "binviz":
      return box("Bin packing visualization", `${p.algorithm ?? ""}, capacity ${p.capacity ?? "?"}, items ${p.items ?? ""}`);
    case "video": {
      const auto = p.autoplay === "true";
      return `<figure class="pv-media"><video src="${esc(siteUrl(p.src))}"${auto ? " autoplay muted loop playsinline" : " controls preload=\"metadata\""}${p.poster ? ` poster="${esc(siteUrl(p.poster))}"` : ""}${p.width ? ` style="max-width:${esc(p.width)}px"` : ""}></video>${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}</figure>`;
    }
    case "audio":
      return `<figure class="pv-media"><audio src="${esc(siteUrl(p.src))}" controls preload="metadata"></audio>${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}</figure>`;
    case "figure":
      return `<figure class="pv-media"><img src="${esc(siteUrl(p.src))}" alt="${esc(p.alt ?? p.caption ?? "")}"${p.width ? ` width="${esc(p.width)}"` : ""}>${p.title || p.caption ? `<figcaption>${p.title ? `<b>${esc(p.title)}</b> ` : ""}${esc(p.caption ?? "")}${p.attr ? ` · ${esc(p.attr)}` : ""}</figcaption>` : ""}</figure>`;
    case "details":
      return `<details class="pv-collapse"${p.open === "true" ? " open" : ""}><summary>${esc(p.summary ?? "Details")}</summary>${inner}</details>`;
    case "highlight":
      return codeBlock(sc.inner ?? "", highlightInfo(p["0"] ?? "", p["1"]));
    case "vimeo": {
      const id = p.id ?? p["0"] ?? "";
      return box("Vimeo", "", `<a href="https://vimeo.com/${esc(id)}" target="_blank" rel="noopener">vimeo.com/${esc(id)}</a>`);
    }
    case "x":
    case "twitter":
    case "tweet":
      return box("Post on X", "", `<a href="https://x.com/${esc(p.user ?? "")}/status/${esc(p.id ?? "")}" target="_blank" rel="noopener">@${esc(p.user ?? "")} / ${esc(p.id ?? "")}</a>`);
    case "instagram":
      return box("Instagram post", "", `<a href="https://www.instagram.com/p/${esc(p.id ?? p["0"] ?? "")}/" target="_blank" rel="noopener">${esc(p.id ?? p["0"] ?? "")}</a>`);
    case "gist":
      return box("GitHub gist", "", `<a href="https://gist.github.com/${esc(p.user ?? p["0"] ?? "")}/${esc(p.id ?? p["1"] ?? "")}" target="_blank" rel="noopener">${esc(p.user ?? p["0"] ?? "")}/${esc(p.id ?? p["1"] ?? "")}${p["2"] ? ` (${esc(p["2"])})` : ""}</a>`);
    case "qr":
      return box("QR code", p.text ?? sc.inner ?? "");
    case "ltr":
    case "rtl":
      return `<div dir="${sc.name}">${inner}</div>`;
    case "rawhtml":
      return sc.inner ?? "";
    case "ref":
    case "relref":
      return `<a href="#" class="pv-inline">${esc(p["0"] ?? p.path ?? "")}</a>`;
    case "param":
      return `<code class="pv-inline">param: ${esc(p["0"] ?? p.name ?? "")}</code>`;
    case "inTextImg":
      return `<img class="pv-intext" src="${esc(siteUrl(p.url))}" alt="${esc(p.alt ?? "")}" height="${esc(p.height ?? "15")}">`;
    default:
      return box(sc.name, Object.entries(p).map(([k, v]) => (/^\d+$/.test(k) ? v : `${k}=${v}`)).join(" "), inner);
  }
}

export function render(src: string): string {
  // Shortcodes become placeholders so marked doesn't touch them, then the
  // rendered boxes are swapped back in.
  const parts: string[] = [];
  const withMarks = replaceShortcodes(preprocess(src), (sc) => {
    parts.push(renderShortcode(sc));
    const i = parts.length - 1;
    return INLINE_SHORTCODES.has(sc.name) ? `<span data-pv-sc="${i}"></span>` : `\n\n<div data-pv-sc="${i}"></div>\n\n`;
  });
  const html = md.parse(withMarks, { async: false });
  return html.replace(/<(div|span) data-pv-sc="(\d+)"><\/\1>/g, (_, _tag, i) => parts[Number(i)]);
}

const fetched = new Map<string, Promise<string | null>>();

/** Fetches each repo-code file (once per URL) and shows it like the site does. */
export function hydrateRepoCode(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".pv-repo-code[data-url]").forEach((el) => {
    const url = el.dataset.url!;
    const p = JSON.parse(el.dataset.params!) as Record<string, string>;
    if (!fetched.has(url)) fetched.set(url, fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null));
    void fetched.get(url)!.then((text) => {
      if (!el.isConnected) return;
      if (text === null) {
        el.innerHTML = box("Code from GitHub", `Failed to fetch ${p.repo}/${p.path}`);
        return;
      }
      let lines = text.replace(/\n$/, "").split("\n");
      const [a, b] = (p.lines ?? "").split("-").map(Number);
      if (a) lines = lines.slice(a - 1, b || a);
      const lang = p.lang ?? (p.path ?? "").split(".").pop() ?? "";
      const info = [lang, `title="${(p.title ?? p.path ?? "").replace(/"/g, "")}"`, ...["numbers", "hl", "add", "del"].filter((k) => p[k]).map((k) => `${k}="${p[k]}"`)].join(" ");
      el.innerHTML = DOMPurify.sanitize(codeBlock(lines.join("\n"), info));
    });
  });
}

let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;

/** Draws ```mermaid blocks; Mermaid is loaded the first time a post uses one. */
export function hydrateMermaid(root: HTMLElement): void {
  const blocks = [...root.querySelectorAll<HTMLElement>("pre.pv-mermaid")];
  if (!blocks.length) return;
  mermaidLoader ??= import("mermaid").then((m) => {
    m.default.initialize({ startOnLoad: false, theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral" });
    return m.default;
  });
  void mermaidLoader.then((mermaid) => mermaid.run({ nodes: blocks, suppressErrors: true }));
}

export function renderPreview(src: string): string {
  return DOMPurify.sanitize(render(src), {
    ADD_TAGS: ["math", "semantics", "annotation", "video", "audio"],
    ADD_ATTR: ["open", "target", "controls", "autoplay", "muted", "loop", "playsinline", "preload", "poster", "dir"],
  });
}
