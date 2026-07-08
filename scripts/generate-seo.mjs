// Runs after `vite build`. Generates:
//   - dist/blog/<slug>/index.html      (static, crawlable OG/Twitter preview per post)
//   - dist/project/<id>/index.html     (same, for project deep-dive pages)
//   - dist/sitemap.xml
//   - dist/robots.txt
//   - dist/feed.xml
//
// Why this exists: the site is a hash-routed SPA (see src/lib/router.ts), so
// "https://.../#/blog?slug=x" is never sent to the server and social-media/
// search crawlers that don't execute JS only ever see the one static
// index.html with generic meta tags. This script produces one small static
// HTML file per post/project at a real path, with per-page title/description/
// image, so shared links preview correctly. Human visitors who land on it get
// redirected straight into the SPA. Project data is loaded from the real
// src/data/projects.ts (via esbuild) rather than duplicated here, so there's
// one source of truth.

import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLOGS_DIR = join(ROOT, "src/data/blogs");
const DIST = join(ROOT, "dist");
const SITE_ORIGIN = "https://priyanshuiitghy2006.github.io";

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw.trim() };
  const [, frontmatter, body] = match;
  const data = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) data[key] = value;
  }
  return { data, body: body.trim() };
}

function slugFromFilename(filename) {
  return filename.replace(/\.md$/, "");
}

function escAttr(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function loadPosts() {
  let files = [];
  try {
    files = readdirSync(BLOGS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return files.map((filename) => {
    const raw = readFileSync(join(BLOGS_DIR, filename), "utf-8");
    const { data } = parseFrontmatter(raw);
    const slug = data.slug || slugFromFilename(filename);
    return {
      slug,
      title: data.title || slug,
      date: data.date || "",
      excerpt: data.excerpt || "",
      cover: data.cover || "",
    };
  });
}

function postPreviewHtml(post) {
  const url = `${SITE_ORIGIN}/blog/${post.slug}/`;
  const target = `/#/blog?slug=${encodeURIComponent(post.slug)}`;
  const title = escAttr(post.title);
  const description = escAttr(post.excerpt || "A blog post by Priyanshu Debnath.");
  const image = post.cover ? `${SITE_ORIGIN}/${post.cover.replace(/^\//, "")}` : `${SITE_ORIGIN}/profile.jpg`;
  const cardType = post.cover ? "summary_large_image" : "summary";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} — Priyanshu Debnath</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${escAttr(url)}" />

    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${escAttr(image)}" />
    <meta property="og:url" content="${escAttr(url)}" />
    ${post.date ? `<meta property="article:published_time" content="${escAttr(post.date)}" />` : ""}

    <meta name="twitter:card" content="${cardType}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${escAttr(image)}" />

    <meta http-equiv="refresh" content="0; url=${escAttr(target)}" />
    <script>location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <p>Redirecting to <a href="${escAttr(target)}">${title}</a>…</p>
  </body>
</html>
`;
}

// Loads the real PROJECTS array from src/data/projects.ts (bundled with
// esbuild since it's plain TS with no runtime deps) rather than
// duplicating project data in this script.
async function loadProjects() {
  const tmpFile = join(DIST, ".tmp-projects.mjs");
  try {
    await build({
      entryPoints: [join(ROOT, "src/data/projects.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: tmpFile,
      logLevel: "silent",
    });
    const mod = await import(`file://${tmpFile}?t=${Date.now()}`);
    return (mod.PROJECTS ?? []).filter((p) => p.body);
  } catch (err) {
    console.warn("generate-seo: failed to load projects.ts, skipping project preview pages:", err.message);
    return [];
  } finally {
    try { rmSync(tmpFile, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

function projectPreviewHtml(project) {
  const url = `${SITE_ORIGIN}/project/${project.id}/`;
  const target = `/#/project?id=${encodeURIComponent(project.id)}`;
  const title = escAttr(project.title);
  const description = escAttr(project.tagline || "A project by Priyanshu Debnath.");
  const image = `${SITE_ORIGIN}/profile.jpg`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} — Priyanshu Debnath</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${escAttr(url)}" />

    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${escAttr(image)}" />
    <meta property="og:url" content="${escAttr(url)}" />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${escAttr(image)}" />

    <meta http-equiv="refresh" content="0; url=${escAttr(target)}" />
    <script>location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <p>Redirecting to <a href="${escAttr(target)}">${title}</a>…</p>
  </body>
</html>
`;
}

function sitemapXml(posts, projects) {
  const staticUrls = [`${SITE_ORIGIN}/`];
  const postUrls = posts.map((p) => `${SITE_ORIGIN}/blog/${p.slug}/`);
  const projectUrls = projects.map((p) => `${SITE_ORIGIN}/project/${p.id}/`);
  const urls = [...staticUrls, ...postUrls, ...projectUrls];

  const entries = urls
    .map((u) => `  <url>\n    <loc>${escAttr(u)}</loc>\n  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

function escXml(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function rfc822(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

// Sorted newest-first, same ordering as the in-app BLOG_POSTS list.
function feedXml(posts) {
  const sorted = [...posts].sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : a.date ? -1 : 1));
  const items = sorted
    .map((p) => {
      const url = `${SITE_ORIGIN}/blog/${p.slug}/`;
      return `  <item>
    <title>${escXml(p.title)}</title>
    <link>${escXml(url)}</link>
    <guid isPermaLink="true">${escXml(url)}</guid>
    <pubDate>${rfc822(p.date)}</pubDate>
    <description>${escXml(p.excerpt || "")}</description>
  </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Priyanshu Debnath — Blog</title>
  <link>${SITE_ORIGIN}/#/blogs</link>
  <description>Notes on competitive programming, mathematics, and systems programming.</description>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

async function main() {
  const posts = loadPosts();
  const projects = await loadProjects();

  for (const post of posts) {
    const dir = join(DIST, "blog", post.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), postPreviewHtml(post), "utf-8");
  }

  for (const project of projects) {
    const dir = join(DIST, "project", project.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), projectPreviewHtml(project), "utf-8");
  }

  writeFileSync(join(DIST, "sitemap.xml"), sitemapXml(posts, projects), "utf-8");
  writeFileSync(join(DIST, "robots.txt"), robotsTxt(), "utf-8");
  writeFileSync(join(DIST, "feed.xml"), feedXml(posts), "utf-8");

  console.log(
    `generate-seo: wrote ${posts.length} blog preview page(s), ${projects.length} project preview page(s), sitemap.xml, robots.txt, feed.xml`,
  );
}

main().catch((err) => {
  console.error("generate-seo failed:", err);
  process.exit(1);
});
