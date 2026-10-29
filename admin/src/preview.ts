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
import { normalizeMath } from "./math";

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
md.use({
  renderer: {
    code({ text, lang }) {
      return codeBlock(text, lang ?? "");
    },
    image({ href, title, text }) {
      // Post images are written relative to the site root (gallery-media/x.png).
      const src = /^([a-z]+:|\/)/i.test(href) ? href : `/${href}`;
      return `<img src="${esc(src)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} loading="lazy">`;
    },
  },
});

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
    default:
      return box(sc.name, Object.entries(p).map(([k, v]) => (/^\d+$/.test(k) ? v : `${k}=${v}`)).join(" "), inner);
  }
}

export function render(src: string): string {
  // Shortcodes become placeholders so marked doesn't touch them, then the
  // rendered boxes are swapped back in.
  const parts: string[] = [];
  const withMarks = replaceShortcodes(normalizeMath(src), (sc) => {
    parts.push(renderShortcode(sc));
    return `\n\n<div data-pv-sc="${parts.length - 1}"></div>\n\n`;
  });
  const html = md.parse(withMarks, { async: false });
  return html.replace(/<div data-pv-sc="(\d+)"><\/div>/g, (_, i) => parts[Number(i)]);
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

export function renderPreview(src: string): string {
  return DOMPurify.sanitize(render(src), { ADD_TAGS: ["math", "semantics", "annotation"], ADD_ATTR: ["open", "target"] });
}
