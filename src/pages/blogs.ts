import "../styles/blog.css";
import { resume } from "../data/resume";
import { BLOG_POSTS, formatBlogDate, type BlogPost } from "../lib/blog";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function tagChips(tags: string[]): string {
  if (!tags.length) return "";
  return `<div class="blog-card-tags">${tags
    .map((t) => `<span class="blog-tag">${esc(t)}</span>`)
    .join("")}</div>`;
}

function card(p: BlogPost): string {
  const thumb = p.cover
    ? `<div class="blog-card-thumb"><img src="${esc(p.cover)}" alt="" loading="lazy"/></div>`
    : `<div class="blog-card-thumb blog-card-thumb-empty" aria-hidden="true">§</div>`;
  return `
    <a class="blog-card" href="#/blog?slug=${encodeURIComponent(p.slug)}">
      ${thumb}
      <div class="blog-card-body">
        ${p.date ? `<div class="blog-card-date">${esc(formatBlogDate(p.date))}</div>` : ""}
        <h3 class="blog-card-title">${esc(p.title)}</h3>
        ${p.excerpt ? `<p class="blog-card-excerpt">${esc(p.excerpt)}</p>` : ""}
        ${tagChips(p.tags)}
      </div>
    </a>`;
}

function pageHtml(): string {
  const body = BLOG_POSTS.length
    ? `<div class="blog-grid">${BLOG_POSTS.map(card).join("")}</div>`
    : `<p class="gl-empty">No posts published yet — check back soon.</p>`;
  return `
    <article class="page section-page blogs-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)} · Blog</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Blog</h2>
        <p class="edu-note">
          Notes on competitive programming, mathematics, and the projects I'm building.
        </p>
        ${body}
      </div>
    </article>`;
}

// Blog posts are compiled in statically from Markdown at build time, so
// there is nothing async to load — render once.
export function mountBlogs(container: HTMLElement): void {
  container.innerHTML = pageHtml();
}
