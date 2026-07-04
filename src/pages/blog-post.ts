import "../styles/blog.css";
import { resume } from "../data/resume";
import { getPost, formatBlogDate, renderMarkdown } from "../lib/blog";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function notFoundHtml(): string {
  return `
    <article class="page section-page blog-post-page">
      <nav class="section-nav">
        <a class="section-back" href="#/blogs">← back to blog</a>
        <span class="section-crumb">${esc(resume.name)} · Blog</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Post not found</h2>
        <p class="edu-note">This post may have been renamed, moved, or unpublished.</p>
        <a class="pj-link" href="#/blogs">← All posts</a>
      </div>
    </article>`;
}

function pageHtml(slug: string | null): string {
  const post = getPost(slug);
  if (!post) return notFoundHtml();

  const tags = post.tags.length
    ? `<div class="blog-post-tags">${post.tags.map((t) => `<span class="blog-tag">${esc(t)}</span>`).join("")}</div>`
    : "";

  return `
    <article class="page section-page blog-post-page">
      <nav class="section-nav">
        <a class="section-back" href="#/blogs">← back to blog</a>
        <span class="section-crumb">${esc(resume.name)} · Blog</span>
      </nav>
      <div class="section-body">
        <header class="blog-post-head">
          <h1 class="blog-post-title">${esc(post.title)}</h1>
          <div class="blog-post-meta">
            ${post.date ? `<span class="blog-post-date">${esc(formatBlogDate(post.date))}</span>` : ""}
            ${tags}
          </div>
        </header>
        ${post.cover ? `<figure class="blog-post-cover"><img src="${esc(post.cover)}" alt=""/></figure>` : ""}
        <div class="blog-content">${renderMarkdown(post.rawBody)}</div>
        <div class="section-more">
          <a class="pj-link" href="#/blogs">← All posts</a>
        </div>
      </div>
    </article>`;
}

export function mountBlogPost(container: HTMLElement, slug: string | null): void {
  container.innerHTML = pageHtml(slug);
}
