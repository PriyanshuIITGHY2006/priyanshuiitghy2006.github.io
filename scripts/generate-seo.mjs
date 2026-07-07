// Runs after `vite build`. Generates:
//   - dist/blog/<slug>/index.html   (static, crawlable OG/Twitter preview per post,
//                                     redirects real visitors into the SPA hash route)
//   - dist/sitemap.xml
//   - dist/robots.txt
//
// Why this exists: the site is a hash-routed SPA (see src/lib/router.ts), so
// "https://.../#/blog?slug=x" is never sent to the server and social-media/
// search crawlers that don't execute JS only ever see the one static
// index.html with generic meta tags. This script produces one small static
// HTML file per post at a real path, with per-post title/description/image,
// so shared blog links preview correctly. Human visitors who land on it get
// redirected straight into the SPA.

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

function sitemapXml(posts) {
  const staticUrls = [`${SITE_ORIGIN}/`];
  const postUrls = posts.map((p) => `${SITE_ORIGIN}/blog/${p.slug}/`);
  const urls = [...staticUrls, ...postUrls];

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

function main() {
  const posts = loadPosts();

  for (const post of posts) {
    const dir = join(DIST, "blog", post.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), postPreviewHtml(post), "utf-8");
  }

  writeFileSync(join(DIST, "sitemap.xml"), sitemapXml(posts), "utf-8");
  writeFileSync(join(DIST, "robots.txt"), robotsTxt(), "utf-8");
  writeFileSync(join(DIST, "feed.xml"), feedXml(posts), "utf-8");

  console.log(`generate-seo: wrote ${posts.length} blog preview page(s), sitemap.xml, robots.txt, feed.xml`);
}

main();
