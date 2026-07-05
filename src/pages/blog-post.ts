import "../styles/blog.css";
import "katex/dist/katex.min.css";
import { resume } from "../data/resume";
import { 
  getPost, 
  formatBlogDate, 
  renderMarkdown, 
  estimateReadingMinutes, 
  getRunnableBlock,
  BLOG_POSTS 
} from "../lib/blog";
// Replace Judge0 import:
// import { runOnJudge0 } from "../lib/judge0";
import { runCode } from "../lib/compiler";
import {
  getBlogStats,
  recordView,
  likePost,
  getApprovedComments,
  submitComment,
  type BlogComment,
} from "../lib/blog-engagement";
import { SCROLL_TOP_BUTTON_HTML, initScrollTopButton } from "../lib/scroll-top";

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
            <span class="blog-post-read-time">${estimateReadingMinutes(post.rawBody)} min read</span>
            ${tags}
          </div>
        </header>
        ${post.cover ? `<figure class="blog-post-cover"><img src="${esc(post.cover)}" alt=""/></figure>` : ""}
        <div class="blog-content">${renderMarkdown(post.rawBody)}</div>
        ${engagementShell()}
        
        ${getReadMoreHtml(post.slug)} <div class="section-more" style="margin-top: 2rem;">
          <a class="pj-link" href="#/blogs">← All posts</a>
        </div>
      </div>
      ${SCROLL_TOP_BUTTON_HTML}
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
  wireRunnableCode(container);
  wireFloatingVideos(container);
  initScrollTopButton(container);
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

function wireRunnableCode(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".blog-run-panel").forEach((panel) => {
    const id = panel.dataset.runId;
    const btn = panel.querySelector<HTMLButtonElement>('[data-run-action="run"]');
    const status = panel.querySelector<HTMLElement>(".blog-run-status");
    const stdinInput = panel.querySelector<HTMLTextAreaElement>(".blog-run-stdin-input");
    const output = panel.querySelector<HTMLElement>(".blog-run-output");
    if (!id || !btn || !status || !output) return;

    btn.addEventListener("click", async () => {
      const block = getRunnableBlock(id);
      if (!block) return;

      btn.disabled = true;
      status.textContent = "Running…";
      output.hidden = true;
      output.classList.remove("blog-run-error"); // optional: clear previous error styles

      try {
        const result = await runCode(block.compilerId, block.code, stdinInput?.value ?? "");
        
        // OnlineCompiler combines stdout and stderr into output/error fields
        const sections = [result.output, result.error]
          .map((s) => (s ?? "").trim())
          .filter(Boolean);
          
        output.textContent = sections.length ? sections.join("\n\n") : "(no output)";
        output.hidden = false;
        
        if (result.status === "error") {
          status.textContent = `Error (Exit Code: ${result.exit_code})`;
          output.style.color = "#ff6b6b"; // optional visual feedback for errors
        } else {
          status.textContent = `Finished in ${result.time}s`;
          output.style.color = "inherit";
        }
      } catch (err) {
        console.error("Execution error:", err); // Logs to browser console
        
        if (err instanceof Error && err.message === "missing-key") {
            status.textContent = "Error: API Key is missing. GitHub Action didn't inject it.";
        } else if (err instanceof TypeError && err.message === "Failed to fetch") {
            status.textContent = "Error: CORS Blocked. The REST API rejected a direct browser request.";
        } else {
            status.textContent = `API Error: ${err instanceof Error ? err.message : "Unknown"}`;
        }
      } finally {
        btn.disabled = false;
      } 
    });
  });
}
// Add this at the bottom of src/pages/blog-post.ts:

function wireFloatingVideos(container: HTMLElement): void {
  const wrappers = container.querySelectorAll<HTMLElement>(".blog-video-embed");
  if (!wrappers.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const iframe = entry.target.querySelector("iframe");
        if (!iframe) return;

        // boundingClientRect.bottom < 0 checks if the element has scrolled UP past the viewport
        if (!entry.isIntersecting && entry.boundingClientRect.bottom < 0) {
          iframe.classList.add("floating");
        } else {
          iframe.classList.remove("floating");
        }
      });
    },
    { threshold: 0 } // Triggers exactly when the wrapper fully leaves or enters the viewport
  );

  wrappers.forEach((w) => observer.observe(w));
}
function getReadMoreHtml(currentSlug: string): string {
  // Get up to 2 posts that aren't the one currently being read
  const otherPosts = BLOG_POSTS.filter((p) => p.slug !== currentSlug).slice(0, 2);
  
  if (otherPosts.length === 0) return "";

  const cardsHtml = otherPosts.map(p => {
    const thumb = p.cover
      ? `<div class="blog-card-thumb"><img src="${esc(p.cover)}" alt="" loading="lazy"/></div>`
      : `<div class="blog-card-thumb blog-card-thumb-empty" aria-hidden="true">§</div>`;

    const tags = p.tags.length
      ? `<div class="blog-card-tags">${p.tags.map((t) => `<span class="blog-tag">${esc(t)}</span>`).join("")}</div>`
      : "";

    return `
      <a class="blog-card" href="#/blog?slug=${encodeURIComponent(p.slug)}">
        ${thumb}
        <div class="blog-card-body">
          ${p.date ? `<div class="blog-card-date">${esc(formatBlogDate(p.date))} · ${estimateReadingMinutes(p.rawBody)} min read</div>` : ""}
          <h3 class="blog-card-title">${esc(p.title)}</h3>
          ${p.excerpt ? `<p class="blog-card-excerpt">${esc(p.excerpt)}</p>` : ""}
          ${tags}
        </div>
      </a>`;
  }).join("");

  return `
    <div class="blog-read-more" style="margin-top: 3rem; padding-top: 1.5rem; border-top: 0.6px solid #ddd;">
      <h3 class="section" style="margin-top: 0; border: none; padding: 0;">Read more</h3>
      <div class="blog-grid" style="margin-top: 1rem;">
        ${cardsHtml}
      </div>
    </div>
  `;
}
