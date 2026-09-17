// Called from the deploy workflow for each newly-added src/data/blogs/*.md
// file in a push. Parses the post's frontmatter and asks the notify-new-post
// edge function to email everyone in blog_subscribers about it.

import { readFileSync } from "node:fs";

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return {};
  const [, frontmatter] = match;
  const data = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) data[key] = value;
  }
  return data;
}

function slugFromFilename(filePath) {
  return filePath.split("/").pop().replace(/\.md$/, "");
}

async function main() {
  const filePath = process.argv[2];
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL;

  if (!filePath) {
    console.error("Usage: node notify-new-post.mjs <path-to-markdown-file>");
    process.exit(1);
  }
  if (!secret || !functionsUrl) {
    console.error("notify-new-post: missing INTERNAL_WEBHOOK_SECRET or SUPABASE_FUNCTIONS_URL, skipping.");
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf-8");
  const data = parseFrontmatter(raw);
  const slug = data.slug || slugFromFilename(filePath);
  const title = data.title || slug;

  const res = await fetch(`${functionsUrl}/notify-new-post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({ title, slug, excerpt: data.excerpt || "", date: data.date || "" }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`notify-new-post failed for ${filePath}: ${res.status} ${body}`);
    process.exit(1);
  }
  console.log(`notify-new-post: ${filePath} -> ${body}`);
}

main();
