// Live preview for the post editor: Markdown + KaTeX, with each Hugo
// shortcode drawn as a simple box. It shows structure and math, not the
// exact site styling. The real page is what Hugo builds after a publish.

import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { replaceShortcodes, type Shortcode } from "./shortcodes";

const md = new Marked({ gfm: true });
md.use(markedKatex({ throwOnError: false, nonStandard: true }));
md.use({
  renderer: {
    code({ text, lang }) {
      const [language = "", ...rest] = (lang ?? "").trim().split(/\s+/);
      const title = rest.join(" ").match(/title="([^"]*)"/)?.[1];
      // [!code ++] style markers are rendered by the site; drop them here.
      const clean = text.replace(/[ \t]*(?:\/\/|#|--|\/\*)?[ \t]*\[!code [^\]]+\][ \t]*(?:\*\/)?/g, "");
      return `<figure class="pv-code">${title ? `<figcaption>${esc(title)}</figcaption>` : ""}<pre><code${language ? ` data-lang="${esc(language)}"` : ""}>${esc(clean)}</code></pre></figure>`;
    },
  },
});

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

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
      return box(p.title || (p.type ?? "note").toUpperCase(), "", inner);
    case "problem":
      return box(p.title ?? "Problem", [p.source, p.rating && `Rating ${p.rating}`, p.limits, p.tags].filter(Boolean).join(" · "));
    case "youtube":
      return box("YouTube", p.id ?? Object.values(p)[0] ?? "");
    case "diagram":
      return box("Diagram", `${p.name ?? ""}${p.caption ? `: ${p.caption}` : ""}`);
    case "repo-card":
      return box("Repo card", [p.repo, p.title].filter(Boolean).join(" · "));
    case "repo-code":
      return box("Code from GitHub", `${p.repo ?? ""}/${p.path ?? ""}${p.lines ? ` (lines ${p.lines})` : ""}`);
    case "binviz":
      return box("Bin packing visualization", `${p.algorithm ?? ""} ${p.items ?? ""}`);
    default:
      return box(sc.name, Object.entries(p).map(([k, v]) => `${k}=${v}`).join(" "), inner);
  }
}

export function render(src: string): string {
  // Shortcodes become placeholders so marked doesn't touch them, then the
  // rendered boxes are swapped back in.
  const parts: string[] = [];
  const withMarks = replaceShortcodes(src, (sc) => {
    parts.push(renderShortcode(sc));
    return `\n\n<div data-pv-sc="${parts.length - 1}"></div>\n\n`;
  });
  const html = md.parse(withMarks, { async: false });
  return html.replace(/<div data-pv-sc="(\d+)"><\/div>/g, (_, i) => parts[Number(i)]);
}

export function renderPreview(src: string): string {
  return DOMPurify.sanitize(render(src), { ADD_TAGS: ["math", "semantics", "annotation"], ADD_ATTR: ["open"] });
}
