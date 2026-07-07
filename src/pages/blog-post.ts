import "../styles/blog.css";
import "katex/dist/katex.min.css";
import { resume } from "../data/resume";
import { 
  getPost, 
  formatBlogDate, 
  renderMarkdown, 
  estimateReadingMinutes, 
  codeBlocksRegistry,
  BLOG_POSTS 
} from "../lib/blog";
import { runCode } from "../lib/compiler";
import {
  getBlogStats, 
  recordView, 
  likePost, 
  getApprovedComments, 
  submitComment, 
  type BlogComment
} from "../lib/blog-engagement";
import { SCROLL_TOP_BUTTON_HTML, initScrollTopButton } from "../lib/scroll-top";
import { SUBSCRIBE_FORM_HTML, wireSubscribeForm } from "../lib/subscribe";

// ============================================================================
// Monaco Editor Integration
// ============================================================================

let monacoLoaderPromise: Promise<any> | null = null;

export function loadMonaco(): Promise<any> {
  if ((window as any).monaco) return Promise.resolve((window as any).monaco);
  if (monacoLoaderPromise) return monacoLoaderPromise;

  monacoLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js';
    script.onload = () => {
      const require = (window as any).require;
      require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
      require(['vs/editor/editor.main'], () => resolve((window as any).monaco));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return monacoLoaderPromise;
}

export const editorInstances = new Map<string, any>();

async function initEditors(container: HTMLElement) {
  const editorContainers = container.querySelectorAll('.monaco-editor-container');
  if (editorContainers.length === 0) return;

  try {
    const monaco = await loadMonaco();
    editorContainers.forEach((el) => {
       const id = el.id;
       const block = codeBlocksRegistry.get(id);
       if (!block) return;
       
       el.innerHTML = ''; // Clear Highlight.js fallback content
       
       const editor = monaco.editor.create(el as HTMLElement, {
         value: block.code,
         language: getMonacoLanguage(block.language),
         theme: 'vs-dark',
         readOnly: !block.isRunnable,
         minimap: { enabled: false },
         scrollBeyondLastLine: false,
         automaticLayout: true,
         padding: { top: 16, bottom: 16 },
         fontSize: 14,
       });
       
       editorInstances.set(id, editor);
    });
  } catch (err) {
    console.error("Failed to load Monaco editor", err);
  }
}

function getMonacoLanguage(lang: string) {
  const map: Record<string, string> = {
    'cpp': 'cpp', 'c++': 'cpp', 'c': 'c',
    'python': 'python', 'py': 'python', 'java': 'java',
    'javascript': 'javascript', 'js': 'javascript',
    'typescript': 'typescript', 'ts': 'typescript',
    'rust': 'rust', 'go': 'go', 'bash': 'shell', 'sh': 'shell',
    'json': 'json', 'xml': 'xml', 'html': 'html', 'css': 'css', 'sql': 'sql',
  };
  return map[lang.toLowerCase()] || 'plaintext';
}

// ============================================================================
// Page Rendering
// ============================================================================

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function notFoundHtml(): string {
  return `
    <article class="page section-page blog-post-page">
      <div class="section-body">
        <h1 class="section">Post Not Found</h1>
        <p>The post you are looking for does not exist.</p>
        <a class="pj-link" href="#/blogs">← Back to blog</a>
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
            <span class="blog-post-read-time">${estimateReadingMinutes(post.rawBody)} min read</span>
            ${tags}
          </div>
        </header>
        ${post.cover ? `<figure class="blog-post-cover"><img src="${esc(post.cover)}" alt=""/></figure>` : ""}
        
        <div class="blog-content">${renderMarkdown(post.rawBody)}</div>
        
        ${engagementShell()}
        ${getReadMoreHtml(post.slug)} 
        
        <!-- Subscribe Form explicitly moved to the very bottom -->
        <div style="margin-top: 3rem;">
          ${SUBSCRIBE_FORM_HTML}
        </div>

        <div class="section-more" style="margin-top: 2rem;">
          <a class="pj-link" href="#/blogs">← All posts</a>
        </div>
      </div>
      ${SCROLL_TOP_BUTTON_HTML}
    </article>`;
}

// ============================================================================
// Lifecycle Hooks
// ============================================================================

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
  wireSubscribeForm(container);
  initScrollTopButton(container);
  
  // Initialize dynamic monaco editors
  void initEditors(container);
}

export function unmountBlogPost(): void {
  // Dispose all active Monaco instances to prevent memory leaks when navigating away
  editorInstances.forEach((editor) => editor.dispose());
  editorInstances.clear();
}

// ============================================================================
// Runnable Code Logic
// ============================================================================

function wireRunnableCode(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".blog-run-panel").forEach((panel) => {
    const id = panel.dataset.runId;
    const btn = panel.querySelector<HTMLButtonElement>('[data-run-action="run"]');
    const status = panel.querySelector<HTMLElement>(".blog-run-status");
    const stdinInput = panel.querySelector<HTMLTextAreaElement>(".blog-run-stdin-input");
    const output = panel.querySelector<HTMLElement>(".blog-run-output");

    if (!id || !btn || !status || !output) return;

    renderTurnstileWidget(panel, () => (btn.disabled = false));

    btn.addEventListener("click", async () => {
      const block = codeBlocksRegistry.get(id); 
      if (!block || !block.compilerId) return;

      // Extract code from Monaco instance if it loaded, otherwise fallback to static string
      const editor = editorInstances.get(id);
      const sourceCode = editor ? editor.getValue() : block.code;

      btn.disabled = true;
      status.textContent = "Running…";
      output.hidden = true;

      try {
        const result = await runCode(block.compilerId, sourceCode, stdinInput?.value ?? "");
        
        const sections = [result.output, result.error]
          .map((s) => (s ?? "").trim())
          .filter(Boolean);
          
        output.textContent = sections.length ? sections.join("\n\n") : "(no output)";
        output.hidden = false;
        
        if (result.status === "error") {
          status.textContent = `Error (Exit Code: ${result.exit_code})`;
          output.style.color = "#ff6b6b";
        } else {
          status.textContent = `Finished in ${result.time}s`;
          output.style.color = "inherit";
        }
      } catch (err) {
        console.error("Execution error:", err);
        status.textContent = `API Error: ${err instanceof Error ? err.message : "Unknown"}`;
      } finally {
        btn.disabled = true;
        const el = panel.querySelector<HTMLElement>(".cf-turnstile");
        const widgetId = el?.dataset.tsWidgetId;
        if ((window as any).turnstile) {
            (window as any).turnstile.reset(widgetId);
        }
      }
    });
  });
}

// ============================================================================
// Existing App Engagement & UI Functions
// ============================================================================

function engagementShell(): string {
  return `
    <div class="blog-engagement">
      <div class="blog-stats">
        <span id="blog-views">... views</span>
        <button id="blog-like-btn" class="blog-like-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          <span id="blog-likes">...</span>
        </button>
      </div>
      <div class="blog-comments-section">
        <h3>Comments</h3>
        <div id="blog-comments-list" class="blog-comments-list">Loading comments...</div>
        <form id="blog-comment-form" class="blog-comment-form">
          <input type="text" id="comment-author" placeholder="Name (optional)" />
          <textarea id="comment-content" placeholder="Leave a comment..." required></textarea>
          <div class="cf-turnstile-comment" data-sitekey="${import.meta.env.VITE_TURNSTILE_SITE_KEY}"></div>
          <button type="submit" disabled>Post Comment</button>
        </form>
      </div>
    </div>`;
}

function commentItem(c: BlogComment): string {
  const author = c.author_name ? esc(c.author_name) : "Anonymous";
  const date = new Date(c.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `
    <div class="blog-comment">
      <div class="blog-comment-header">
        <strong>${author}</strong> <span>${date}</span>
      </div>
      <p class="blog-comment-body">${esc(c.content)}</p>
    </div>`;
}

async function loadEngagement(container: HTMLElement, slug: string) {
  const viewsEl = container.querySelector("#blog-views");
  const likesEl = container.querySelector("#blog-likes");
  const commentsList = container.querySelector("#blog-comments-list");

  try {
    const stats = await getBlogStats(slug);
    if (viewsEl) viewsEl.textContent = `${stats.views} views`;
    if (likesEl) likesEl.textContent = `${stats.likes}`;

    const comments = await getApprovedComments(slug);
    if (commentsList) {
      commentsList.innerHTML = comments.length 
        ? comments.map(commentItem).join("") 
        : "<p class='no-comments'>No comments yet. Be the first!</p>";
    }
  } catch (err) {
    console.error("Failed to load engagement data", err);
  }
}

function wireLikeButton(container: HTMLElement, slug: string) {
  const btn = container.querySelector<HTMLButtonElement>("#blog-like-btn");
  const likesEl = container.querySelector("#blog-likes");
  if (!btn || !likesEl) return;

  const likedKey = `liked_${slug}`;
  if (localStorage.getItem(likedKey)) {
    btn.classList.add("liked");
    btn.disabled = true;
  }

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const newLikes = await likePost(slug);
      likesEl.textContent = `${newLikes}`;
      btn.classList.add("liked");
      localStorage.setItem(likedKey, "true");
    } catch (err) {
      console.error("Failed to like post", err);
      btn.disabled = false;
    }
  });
}

function wireCommentForm(container: HTMLElement, slug: string) {
  const form = container.querySelector<HTMLFormElement>("#blog-comment-form");
  const authorInput = container.querySelector<HTMLInputElement>("#comment-author");
  const contentInput = container.querySelector<HTMLTextAreaElement>("#comment-content");
  const submitBtn = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  const turnstileContainer = form?.querySelector<HTMLElement>(".cf-turnstile-comment");

  if (!form || !authorInput || !contentInput || !submitBtn || !turnstileContainer) return;

  let turnstileToken = "";
  if ((window as any).turnstile) {
    (window as any).turnstile.render(turnstileContainer, {
      sitekey: turnstileContainer.dataset.sitekey,
      callback: (token: string) => {
        turnstileToken = token;
        submitBtn.disabled = false;
      },
      "error-callback": () => {
        submitBtn.disabled = true;
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!turnstileToken) return;

    const author = authorInput.value.trim();
    const content = contentInput.value.trim();
    if (!content) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      await submitComment(slug, author, content, turnstileToken);
      form.innerHTML = "<p class='comment-success'>Comment submitted for moderation. Thank you!</p>";
    } catch (err) {
      console.error("Failed to submit comment", err);
      submitBtn.textContent = "Error. Try again.";
      submitBtn.disabled = false;
    }
  });
}

function wireFloatingVideos(container: HTMLElement) {
  const videos = container.querySelectorAll<HTMLVideoElement>("video[data-floating]");
  videos.forEach(video => {
    // Implement any custom floating video logic if you have it here
  });
}

function renderTurnstileWidget(container: HTMLElement, onsuccess: () => void) {
  const el = container.querySelector<HTMLElement>('.cf-turnstile');
  if (!el || !(window as any).turnstile) return;
  
  (window as any).turnstile.render(el, {
    sitekey: el.dataset.sitekey,
    callback: onsuccess
  });
}

function getReadMoreHtml(currentSlug: string): string {
  const others = BLOG_POSTS.filter(p => p.slug !== currentSlug);
  if (others.length === 0) return "";
  
  // Pick 2 random posts
  const shuffled = others.sort(() => 0.5 - Math.random()).slice(0, 2);
  
  return `
    <div class="blog-read-more">
      <h3>Read More</h3>
      <div class="blog-grid" style="grid-template-columns: 1fr 1fr; margin-top: 1rem;">
        ${shuffled.map(p => `
          <a class="blog-card" href="#/blog?slug=${encodeURIComponent(p.slug)}">
            <div class="blog-card-body">
              <h4 style="margin: 0 0 0.5rem 0;">${esc(p.title)}</h4>
              ${p.excerpt ? `<p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">${esc(p.excerpt)}</p>` : ""}
            </div>
          </a>
        `).join("")}
      </div>
    </div>
  `;
}
