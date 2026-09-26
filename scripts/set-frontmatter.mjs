// Sets (or adds) one `key: value` line in a blog post's frontmatter.
// Used by .github/workflows/latex-pdf.yml to link a compiled PDF:
//   node scripts/set-frontmatter.mjs src/data/blogs/<slug>.md pdf gallery-media/<slug>.pdf
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [file, key, value] = process.argv.slice(2);
if (!file || !key || value === undefined) {
  console.error("usage: set-frontmatter.mjs <file> <key> <value>");
  process.exit(2);
}
if (!existsSync(file)) {
  console.log(`${file} not found, skipping`);
  process.exit(0);
}

const raw = readFileSync(file, "utf8");
const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)$/);
if (!m) {
  console.error(`${file} has no frontmatter`);
  process.exit(1);
}
const lines = m[1].split(/\r?\n/);
const i = lines.findIndex((l) => l.slice(0, l.indexOf(":")).trim() === key);
if (i === -1) lines.push(`${key}: ${value}`);
else lines[i] = `${key}: ${value}`;
writeFileSync(file, `---\n${lines.join("\n")}\n---${m[2]}`);
console.log(`${file}: ${key} = ${value}`);
