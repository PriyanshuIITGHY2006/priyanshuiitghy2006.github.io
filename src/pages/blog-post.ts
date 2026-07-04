import "../styles/blog.css";
import { resume } from "../data/resume";
import { getPost, formatBlogDate, renderMarkdown } from "../lib/blog";
import {
  getBlogStats,
  recordView,
  likePost,
  getApprovedComments,
  submitComment,
  type BlogComment,
} from "../lib/blog-engagement";

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

function commentItem(c: BlogComment): string {
  const date = c.created_at ? formatBlogDate(c.created_at.slice(0, 10)) : "";
  return `
    <li class="blog-comment">
      <div class="blog-comment-head">
        <span class="blog-comment-name">${esc(c.name)}</span>
        ${date ? `<span class="blog-comment-date">${esc(date)}</span>` : ""}
      </div>
      <p class="blog-comment-message">${esc(c.message)}</p>
    </li>`;
}

function engagementShell(): string {
  return `
    <div class="blog-engagement">
      <div class="blog-engagement-bar">
        <span class="blog-views" id="blog-views">— views</span>
        <button class="blog-like-btn" id="blog-like-btn" type="button" disabled>
          <span class="blog-like-heart">♥</span> <span id="blog-like-count">—</span>
        </button>
      </div>

      <div class="blog-comments-section">
        <h3 class="section blog-comments-title">Comments</h3>
        <ul class="blog-comments-list" id="blog-comments-list">
          <li class="blog-comments-loading">Loading comments…</li>
        </ul>

        <form id="blog-comment-form" class="contact-form blog-comment-form">
          <div id="blog-comment-status" class="contact-status" style="display:none"></div>
          <div>
            <label for="bc-name">Name</label>
            <input id="bc-name" name="name" type="text" maxlength="60" required autocomplete="name"/>
          </div>
          <div>
            <label for="bc-message">Comment</label>
            <textarea id="bc-message" name="message" maxlength="1000" required></textarea>
          </div>
          <div class="contact-actions">
            <button type="submit" class="pj-link contact-submit">Post comment</button>
          </div>
          <p class="blog-comment-note">Comments are reviewed before they appear publicly.</p>
        </form>
      </div>
    </div>`;
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
        ${engagementShell()}
        <div class="section-more">
          <a class="pj-link" href="#/blogs">← All posts</a>
        </div>
      </div>
    </article>`;
}

export function mountBlogPost(container: HTMLElement, slug: string | null): void {
  container.innerHTML = pageHtml(slug);

  const post = getPost(slug);
  if (!post) return;

  void recordView(post.slug);
  void loadEngagement(container, post.slug);
  wireLikeButton(container, post.slug);
  wireCommentForm(container, post.slug);
}

async function loadEngagement(container: HTMLElement, slug: string): Promise<void> {
  const [stats, comments] = await Promise.all([
    getBlogStats(slug),
    getApprovedComments(slug),
  ]);

  const viewsEl = container.querySelector<HTMLElement>("#blog-views");
  if (viewsEl) viewsEl.textContent = `${stats.views} view${stats.views === 1 ? "" : "s"}`;

  const likeCountEl = container.querySelector<HTMLElement>("#blog-like-count");
  if (likeCountEl) likeCountEl.textContent = String(stats.likes);

  const likeBtn = container.querySelector<HTMLButtonElement>("#blog-like-btn");
  if (likeBtn) {
    const alreadyLiked = localStorage.getItem(`blog-liked:${slug}`) === "1";
    likeBtn.disabled = alreadyLiked;
    if (alreadyLiked) likeBtn.classList.add("blog-liked");
  }

  const list = container.querySelector<HTMLElement>("#blog-comments-list");
  if (list) {
    list.innerHTML = comments.length
      ? comments.map(commentItem).join("")
      : `<li class="blog-comments-empty">No comments yet — be the first.</li>`;
  }
}

function wireLikeButton(container: HTMLElement, slug: string): void {
  const btn = container.querySelector<HTMLButtonElement>("#blog-like-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (localStorage.getItem(`blog-liked:${slug}`) === "1") return;
    btn.disabled = true;
    try {
      const newCount = await likePost(slug);
      localStorage.setItem(`blog-liked:${slug}`, "1");
      btn.classList.add("blog-liked");
      const countEl = container.querySelector<HTMLElement>("#blog-like-count");
      if (countEl) countEl.textContent = String(newCount);
    } catch {
      btn.disabled = false;
    }
  });
}

function wireCommentForm(container: HTMLElement, slug: string): void {
  const form = container.querySelector<HTMLFormElement>("#blog-comment-form");
  const status = container.querySelector<HTMLElement>("#blog-comment-status");
  if (!form || !status) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = container.querySelector<HTMLInputElement>("#bc-name")!.value.trim();
    const message = container.querySelector<HTMLTextAreaElement>("#bc-message")!.value.trim();
    if (!name || !message) return;

    const submitBtn = form.querySelector<HTMLButtonElement>(".contact-submit")!;
    submitBtn.disabled = true;
    status.style.display = "none";
    try {
      await submitComment(slug, name, message);
      status.textContent = "Thanks — your comment is awaiting review and will appear once approved.";
      status.className = "contact-status contact-status-ok";
      status.style.display = "block";
      form.reset();
    } catch {
      status.textContent = "Something went wrong posting that — please try again.";
      status.className = "contact-status contact-status-err";
      status.style.display = "block";
    } finally {
      submitBtn.disabled = false;
    }
  });
}
