// Hugo front matter for content/posts/<slug>.md. Reading uses a real YAML
// parser; writing produces the same layout as the hand-written posts:
//
//   ---
//   title: "..."
//   date: 2026-10-26
//   tags: ["A","B"]
//   summary: "..."
//   description: "..."
//   cover:
//     image: "blog-media/<slug>/cover.png"
//     relative: false
//     hiddenInList: true
//   pdf: "gallery-media/<slug>.pdf"
//   ---
//
// Keys the form doesn't edit are kept and written back after the known ones.

import { load } from "js-yaml";

export interface PostFields {
  title: string;
  date: string;
  lastmod: string;
  tags: string[];
  summary: string;
  cover: string;
  pdf: string;
  draft: boolean;
  extra: Record<string, unknown>;
}

const KNOWN_KEYS = new Set(["title", "date", "lastmod", "tags", "summary", "description", "cover", "pdf", "draft"]);

function str(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v == null ? "" : String(v);
}

export function parsePost(file: string): { fields: PostFields; body: string } {
  const m = file.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const data = (m ? load(m[1]) : {}) as Record<string, unknown> | null;
  const d = data ?? {};
  const cover = d.cover as { image?: unknown } | string | undefined;
  const tags = Array.isArray(d.tags) ? d.tags.map(str) : str(d.tags).split(",").map((t) => t.trim()).filter(Boolean);
  return {
    fields: {
      title: str(d.title),
      date: str(d.date),
      lastmod: str(d.lastmod),
      tags,
      summary: str(d.summary ?? d.description),
      cover: typeof cover === "object" && cover ? str(cover.image) : str(cover),
      pdf: str(d.pdf),
      draft: d.draft === true,
      extra: Object.fromEntries(Object.entries(d).filter(([k]) => !KNOWN_KEYS.has(k))),
    },
    body: m ? m[2] : file,
  };
}

/** A YAML double-quoted scalar; JSON string syntax is valid YAML. */
const q = (s: string) => JSON.stringify(s);

function yamlValue(v: unknown, indent: string): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return q(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return `[${v.map((x) => yamlValue(x, indent)).join(",")}]`;
  const lines = Object.entries(v as Record<string, unknown>).map(([k, x]) => `\n${indent}  ${k}: ${yamlValue(x, `${indent}  `)}`);
  return lines.join("");
}

export function buildPost(f: PostFields, body: string): string {
  const lines = ["---", `title: ${q(f.title)}`, `date: ${f.date}`];
  if (f.lastmod.trim()) lines.push(`lastmod: ${f.lastmod.trim()}`);
  if (f.draft) lines.push("draft: true");
  lines.push(`tags: [${f.tags.map(q).join(",")}]`);
  if (f.summary.trim()) {
    lines.push(`summary: ${q(f.summary.trim())}`, `description: ${q(f.summary.trim())}`);
  }
  if (f.cover.trim()) {
    lines.push("cover:", `  image: ${q(f.cover.trim())}`, "  relative: false", "  hiddenInList: true");
  }
  if (f.pdf.trim()) lines.push(`pdf: ${q(f.pdf.trim())}`);
  for (const [k, v] of Object.entries(f.extra)) lines.push(`${k}: ${yamlValue(v, "")}`);
  lines.push("---", body.replace(/\s*$/, "\n"));
  return lines.join("\n");
}
