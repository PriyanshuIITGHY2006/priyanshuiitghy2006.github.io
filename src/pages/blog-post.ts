import "../styles/blog.css";
import "katex/dist/katex.min.css";
import { resume } from "../data/resume";
import { 
  getPost, 
  formatBlogDate, 
  renderMarkdown, 
  estimateReadingMinutes,
  codeBlocksRegistry,
  testcasesRegistry,
  getLastToc,
  getRelatedPosts,
  binVizRegistry,
  type TocEntry,
  type BlogPost,
  type TestCase,
} from "../lib/blog";
import { previewText, formatSize, downloadText, downloadZip, firstDiff } from "../lib/testcase-files";
import { mountBinPackingViz, type BinVizController } from "../lib/bin-packing-viz";
import { runCode, VerificationRequiredError, type CompilerResult } from "../lib/compiler";
import {
  getBlogStats,
  recordView,
  likePost,
  getApprovedComments,
  submitComment,
  type BlogComment,
} from "../lib/blog-engagement";
import { SCROLL_TOP_BUTTON_HTML, initScrollTopButton } from "../lib/scroll-top";
import { SUBSCRIBE_FORM_HTML, wireSubscribeForm } from "../lib/subscribe";
import { renderTurnstileWidget, resetTurnstileWidget, getTurnstileToken } from "../lib/turnstile";
import { mountBlogGraph } from "../lib/blog-graph";
import { setPageMeta } from "../lib/seo";

// ─── Monaco Editor Setup ────────────────────────────────────────────────────
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

export async function initEditors(container: HTMLElement) {
  const editorContainers = container.querySelectorAll('.monaco-editor-container');
  if (editorContainers.length === 0) return;

  try {
    const monaco = await loadMonaco();
    editorContainers.forEach((el) => {
       const id = el.id;
       const block = codeBlocksRegistry.get(id);
       if (!block) return;
       
       el.innerHTML = '';
       
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
       
       // Ctrl/Cmd+Enter runs the block, same as clicking Run.
       if (block.isRunnable) {
         editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
           container.querySelector<HTMLButtonElement>(`.blog-run-panel[data-run-id="${id}"] [data-run-action="run"]:not(:disabled)`)?.click();
         });
       }
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


// ─── Original UI / Page Logic ───────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function notFoundHtml(): string {
  return `
    <article class="page section-page blog-post-page">
      <nav class="section-nav">
        <a class="section-back" href="/blogs">← back to blog</a>
        <span class="section-crumb">${esc(resume.name)} · Blog</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Post not found</h2>
        <p class="edu-note">This post may have been renamed, moved, or unpublished.</p>
        <a class="pj-link" href="/blogs">← All posts</a>
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
          <div class="cf-turnstile" data-sitekey="${import.meta.env.VITE_TURNSTILE_SITE_KEY}"></div>
          <div class="contact-actions">
            <button type="submit" class="pj-link contact-submit" disabled>Post comment</button>
          </div>
          <p class="blog-comment-note">Comments are reviewed before they appear publicly.</p>
        </form>
      </div>
    </div>`;
}

const SITE_ORIGIN = "https://priyanshudebnath.me";

function tocHtml(toc: TocEntry[]): string {
  if (toc.length < 2) return "";
  const items = toc
    .map((h) => `<li class="blog-toc-item blog-toc-level-${h.level}"><a href="javascript:void(0)" class="blog-toc-link" data-toc-target="${h.id}">${esc(h.text)}</a></li>`)
    .join("");
  return `
    <details class="blog-toc" open>
      <summary class="blog-toc-summary">Contents</summary>
      <ul class="blog-toc-list">${items}</ul>
    </details>`;
}

function shareButtonsHtml(post: BlogPost): string {
  const url = `${SITE_ORIGIN}/blog/${encodeURIComponent(post.slug)}/`;
  const text = encodeURIComponent(post.title);
  const encodedUrl = encodeURIComponent(url);
  return `
    <div class="blog-share">
      <span class="blog-share-label">Share</span>
      <a class="blog-share-btn" target="_blank" rel="noopener noreferrer"
         href="https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}">X</a>
      <a class="blog-share-btn" target="_blank" rel="noopener noreferrer"
         href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}">LinkedIn</a>
      <button type="button" class="blog-share-btn" data-copy-link="${esc(url)}">Copy link</button>
    </div>`;
}

function pageHtml(slug: string | null): string {
  const post = getPost(slug);
  if (!post) return notFoundHtml();

  const tags = post.tags.length
    ? `<p class="blog-post-tags">${post.tags.map((t) => esc(t)).join(" · ")}</p>`
    : "";

  const contentHtml = renderMarkdown(post.rawBody);
  const toc = getLastToc();

  return `
    <div class="blog-progress-bar" id="blog-progress-bar"></div>
    <article class="page section-page blog-post-page">
      <nav class="section-nav">
        <a class="section-back" href="/blogs">← back to blog</a>
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
        ${tocHtml(toc)}
        <div class="blog-content" id="blog-content">${contentHtml}</div>
        ${shareButtonsHtml(post)}
        ${engagementShell()}
        ${getRelatedPostsHtml(post)} 
        
        <div style="margin-top: 3rem;">
            ${SUBSCRIBE_FORM_HTML}
        </div>

        <div class="section-more" style="margin-top: 2rem;">
          <a class="pj-link" href="/blogs">← All posts</a>
        </div>
      </div>
      ${SCROLL_TOP_BUTTON_HTML}
    </article>`;
}

let detachProgressBar: (() => void) | null = null;
let activeBinVizPlayTimers: number[] = [];

export function mountBlogPost(container: HTMLElement, slug: string | null): void {
  container.innerHTML = pageHtml(slug);

  const post = getPost(slug);
  if (!post) {
    setPageMeta({ title: "Post Not Found", noindex: true });
    return;
  }

  setPageMeta({
    title: post.title,
    description: post.excerpt || undefined,
    image: post.cover ? `${location.origin}/${post.cover.replace(/^\//, "")}` : undefined,
    type: "article",
  });

  void recordView(post.slug);
  void loadEngagement(container, post.slug);
  wireLikeButton(container, post.slug);
  wireCommentForm(container, post.slug);
  wireRunnableCode(container);
  wireTestcases(container);
  wireCopyButtons(container);
  wireCodeDownloads(container);
  wireHeadingAnchors(container);
  wireTabs(container);
  wireLightbox(container);
  wireToc(container);
  wireProgressBar(container);
  wireShareButtons(container);
  wireFloatingVideos(container);
  wireAlgoViz(container);
  wireSubscribeForm(container);
  initScrollTopButton(container);
  mountBlogGraph();

  void initEditors(container);
}

export function unmountBlogPost(): void {
  editorInstances.forEach((editor) => editor.dispose());
  editorInstances.clear();
  if (detachProgressBar) {
    detachProgressBar();
    detachProgressBar = null;
  }
  activeBinVizPlayTimers.forEach((id) => window.clearInterval(id));
  activeBinVizPlayTimers = [];
}

// ─── Copy-to-clipboard for code blocks ──────────────────────────────────────

function wireCopyButtons(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".blog-code-copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.copyTarget;
      if (!id) return;
      const editor = editorInstances.get(id);
      const block = codeBlocksRegistry.get(id);
      const text = editor ? editor.getValue() : block?.code ?? "";
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove("copied");
        }, 1500);
      } catch {
        // Clipboard API unavailable — silently ignore, button just won't confirm.
      }
    });
  });
}

// ─── Test-case runner (paired with a runnable code block) ──────────────────

type TestCaseData = { input: string; expected: string };

/** Resolves a case's input/expected, fetching `inputUrl`/`expectedUrl` once if set. */
function makeCaseLoader(c: TestCase): () => Promise<TestCaseData> {
  let pending: Promise<TestCaseData> | null = null;
  const fetchText = async (url: string) => {
    const res = await fetch(`/${url.replace(/^\//, "")}`);
    if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
    return res.text();
  };
  return () =>
    (pending ??= Promise.all([
      c.inputUrl ? fetchText(c.inputUrl) : Promise.resolve(c.input ?? ""),
      c.expectedUrl ? fetchText(c.expectedUrl) : Promise.resolve(c.expected ?? ""),
    ]).then(([input, expected]) => ({ input, expected })));
}

function previewBlockHtml(label: string, text: string, kind: string): string {
  const p = previewText(text);
  const note = p.truncated
    ? `<p class="blog-tc-trunc">Showing a preview of ${formatSize(p.totalChars)} (${p.totalLines.toLocaleString()} lines). Download for the full file.</p>`
    : "";
  return `
    <div class="blog-tc-block">
      <div class="blog-tc-block-head">
        <span>${label}</span>
        <button type="button" class="blog-tc-link" data-tc-dl="${kind}">Download</button>
      </div>
      <pre class="blog-tc-pre">${esc(p.text) || "(empty)"}</pre>
      ${note}
    </div>`;
}

function testcaseRowHtml(name: string, i: number, custom = false): string {
  return `
    <details class="blog-testcase-row" data-tc-index="${i}">
      <summary class="blog-testcase-summary">
        <span class="blog-testcase-name">${esc(name)}${custom ? ` <span class="blog-tc-badge">custom</span>` : ""}</span>
        <span class="blog-testcase-status" data-tc-status>not run</span>
        <button type="button" class="blog-tc-link blog-tc-run-one" data-tc-run-one disabled>Run</button>
      </summary>
      <div class="blog-testcase-body" data-tc-body></div>
    </details>`;
}

function wireTestcases(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".blog-testcases-panel").forEach((panel) => {
    const runId = panel.dataset.testcasesFor;
    const runBtn = panel.querySelector<HTMLButtonElement>("[data-tc-run]");
    const list = panel.querySelector<HTMLElement>(".blog-testcases-list");
    if (!runId || !runBtn || !list) return;
    const cases = [...(testcasesRegistry.get(runId) ?? [])];
    if (!cases.length) return;

    const runPanel = container.querySelector<HTMLElement>(`.blog-run-panel[data-run-id="${runId}"]`);
    const stdinInput = runPanel?.querySelector<HTMLTextAreaElement>(".blog-run-stdin-input");
    const title = panel.querySelector<HTMLElement>(".blog-testcases-title");
    const rows: HTMLDetailsElement[] = [];
    const loaders: (() => Promise<TestCaseData>)[] = [];
    const outputs: (string | null)[] = [];
    const fileBase = (i: number) => `test${String(i + 1).padStart(2, "0")}`;
    let busy = false;

    const renderBody = async (i: number) => {
      const body = rows[i]?.querySelector<HTMLElement>("[data-tc-body]");
      if (!body) return;
      try {
        const { input, expected } = await loaders[i]();
        const out = outputs[i];
        const diff = out !== null ? firstDiff(expected.trim(), out) : null;
        body.innerHTML = `
          ${previewBlockHtml("Input", input, "in")}
          ${previewBlockHtml("Expected output", expected, "ans")}
          ${out !== null ? previewBlockHtml("Your output", out, "out") : ""}
          ${diff ? `<p class="blog-tc-diff">First difference on line ${diff.line}: expected <code>${esc(previewText(diff.expected, 1, 120).text)}</code>, got <code>${esc(previewText(diff.actual, 1, 120).text)}</code></p>` : ""}
          ${stdinInput ? `<button type="button" class="blog-tc-link" data-tc-use-stdin>Use this input in the editor's stdin</button>` : ""}`;
      } catch (err) {
        body.innerHTML = `<p class="blog-tc-trunc">${esc(err instanceof Error ? err.message : "Could not load this test case.")}</p>`;
      }
    };

    const setRowRunDisabled = (disabled: boolean) =>
      rows.forEach((r) => {
        const b = r.querySelector<HTMLButtonElement>("[data-tc-run-one]");
        if (b) b.disabled = disabled;
      });
    const setRunButtonsDisabled = (disabled: boolean) => {
      if (runBtn.disabled !== disabled) runBtn.disabled = disabled;
      rows.forEach((r) => {
        const b = r.querySelector<HTMLButtonElement>("[data-tc-run-one]");
        if (b) b.disabled = disabled;
      });
    };

    /** Runs case i; returns false if the reader must re-verify (stop the batch). */
    const runCase = async (i: number, sourceCode: string, compilerId: string): Promise<boolean> => {
      const statusEl = rows[i]?.querySelector<HTMLElement>("[data-tc-status]");
      if (statusEl) {
        statusEl.textContent = "running…";
        statusEl.className = "blog-testcase-status";
      }
      try {
        const { input, expected } = await loaders[i]();
        const result = await executeCode(runPanel, compilerId, sourceCode, input);
        const actual = (result.output ?? "").trim();
        outputs[i] = actual;
        const pass = result.status !== "error" && firstDiff(expected.trim(), actual) === null;
        if (statusEl) {
          const time = result.time ? ` · ${result.time}s` : "";
          statusEl.textContent = pass ? `passed${time}` : result.status === "error" ? `error${time}` : `failed${time}`;
          statusEl.className = `blog-testcase-status ${pass ? "tc-pass" : "tc-fail"}`;
        }
        if (!pass) rows[i].open = true;
        if (rows[i].open) void renderBody(i);
        return true;
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `error: ${err instanceof Error ? err.message : "unknown"}`;
          statusEl.className = "blog-testcase-status tc-fail";
        }
        if (err instanceof VerificationRequiredError) {
          runPanel?.dispatchEvent(
            new CustomEvent("blog-run-verify", { detail: "Please verify you're human again to keep running test cases." }),
          );
          return false;
        }
        return true;
      }
    };

    const runCases = async (indices: number[]) => {
      const block = codeBlocksRegistry.get(runId);
      if (!block || !block.compilerId || busy) return;
      const editor = editorInstances.get(runId);
      const sourceCode = editor ? editor.getValue() : block.code;
      busy = true;
      setRunButtonsDisabled(true);
      const originalLabel = runBtn.textContent;
      runBtn.textContent = "Running…";
      for (const i of indices) {
        if (!(await runCase(i, sourceCode, block.compilerId))) break;
      }
      const done = rows.filter((r) => r.querySelector(".tc-pass, .tc-fail"));
      const passed = rows.filter((r) => r.querySelector(".tc-pass")).length;
      if (title) title.textContent = `Test cases (${cases.length})${done.length ? ` · ${passed}/${done.length} passed` : ""}`;
      runBtn.textContent = originalLabel;
      busy = false;
      setRunButtonsDisabled(false);
    };

    const attachRow = (row: HTMLDetailsElement, i: number) => {
      rows[i] = row;
      loaders[i] = makeCaseLoader(cases[i]);
      outputs[i] = null;
      row.addEventListener("toggle", () => {
        if (row.open) void renderBody(i);
      });
      row.addEventListener("click", async (e) => {
        const target = e.target as HTMLElement;
        if (target.hasAttribute("data-tc-run-one")) {
          e.preventDefault(); // don't toggle the <details>
          void runCases([i]);
          return;
        }
        const kind = target.dataset.tcDl;
        if (kind) {
          const { input, expected } = await loaders[i]();
          const text = kind === "in" ? input : kind === "ans" ? expected : outputs[i] ?? "";
          downloadText(text, `${fileBase(i)}.${kind}.txt`);
        } else if (target.hasAttribute("data-tc-use-stdin") && stdinInput) {
          stdinInput.value = (await loaders[i]()).input;
          stdinInput.closest("details")?.setAttribute("open", "");
          stdinInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    };

    list.querySelectorAll<HTMLDetailsElement>(".blog-testcase-row").forEach((row, i) => attachRow(row, i));

    // Run buttons unlock together with the main Run button (after verification).
    // Only touches the row buttons, never runBtn itself, so it can't re-trigger.
    new MutationObserver(() => {
      if (!busy) setRowRunDisabled(runBtn.disabled);
    }).observe(runBtn, { attributes: true, attributeFilter: ["disabled"] });

    // Reader-added test cases (kept for this page view only).
    const adder = document.createElement("details");
    adder.className = "blog-tc-adder";
    adder.innerHTML = `
      <summary>+ Add your own test</summary>
      <div class="blog-tc-adder-body">
        <label>Input<textarea rows="4" data-tc-new-input spellcheck="false"></textarea></label>
        <label>Expected output<textarea rows="3" data-tc-new-expected spellcheck="false"></textarea></label>
        <button type="button" class="blog-testcases-run-btn" data-tc-add>Add test</button>
      </div>`;
    panel.appendChild(adder);
    adder.querySelector<HTMLButtonElement>("[data-tc-add]")?.addEventListener("click", () => {
      const inputEl = adder.querySelector<HTMLTextAreaElement>("[data-tc-new-input]")!;
      const expectedEl = adder.querySelector<HTMLTextAreaElement>("[data-tc-new-expected]")!;
      if (!inputEl.value.trim() && !expectedEl.value.trim()) return;
      const i = cases.length;
      cases.push({ name: `Custom ${i + 1}`, input: inputEl.value, expected: expectedEl.value });
      list.insertAdjacentHTML("beforeend", testcaseRowHtml(`Custom ${i + 1}`, i, true));
      attachRow(list.lastElementChild as HTMLDetailsElement, i);
      setRowRunDisabled(runBtn.disabled);
      if (title) title.textContent = `Test cases (${cases.length})`;
      inputEl.value = "";
      expectedEl.value = "";
      adder.open = false;
    });

    panel.querySelector<HTMLButtonElement>("[data-tc-download-all]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      try {
        const all = await Promise.all(loaders.map((load) => load()));
        const files = all.flatMap((d, i) => [
          { name: `${fileBase(i)}.in.txt`, text: d.input },
          { name: `${fileBase(i)}.ans.txt`, text: d.expected },
        ]);
        downloadZip(files, `${runId}-testcases.zip`);
      } catch {
        btn.textContent = "Download failed";
      } finally {
        btn.disabled = false;
      }
    });

    runBtn.addEventListener("click", () => void runCases(cases.map((_, i) => i)));
  });
}

// ─── Code download + heading anchors ────────────────────────────────────────

const CODE_EXTENSIONS: Record<string, string> = {
  cpp: "cpp", "c++": "cpp", c: "c", python: "py", py: "py", java: "java",
  javascript: "js", js: "js", typescript: "ts", ts: "ts", rust: "rs", go: "go",
  bash: "sh", sh: "sh", shell: "sh", json: "json", sql: "sql", html: "html", css: "css", latex: "tex", tex: "tex",
};

function wireCodeDownloads(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>("[data-download-code]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.downloadCode;
      if (!id) return;
      const block = codeBlocksRegistry.get(id);
      const editor = editorInstances.get(id);
      const text = editor ? editor.getValue() : block?.code ?? "";
      const ext = CODE_EXTENSIONS[(block?.language ?? "").toLowerCase()] ?? "txt";
      downloadText(text, `${block?.language === "java" ? "Main" : "solution"}.${ext}`);
    });
  });
}

// ─── Tabs (the chosen label, e.g. "Python", applies to every tab group) ────

const TAB_PREF_KEY = "blog-tab-pref";

function wireTabs(container: HTMLElement): void {
  const groups = [...container.querySelectorAll<HTMLElement>(".blog-tabs")];
  if (!groups.length) return;

  const select = (group: HTMLElement, index: number) => {
    group.querySelectorAll<HTMLButtonElement>(".blog-tab").forEach((b, i) => b.classList.toggle("active", i === index));
    group.querySelectorAll<HTMLElement>(":scope > .blog-tab-panel").forEach((p, i) => (p.hidden = i !== index));
  };
  const applyLabel = (label: string) => {
    groups.forEach((g) => {
      const idx = [...g.querySelectorAll<HTMLButtonElement>(".blog-tab")].findIndex((b) => b.dataset.tabLabel === label);
      if (idx !== -1) select(g, idx);
    });
  };

  groups.forEach((g) => {
    g.querySelectorAll<HTMLButtonElement>(".blog-tab").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        const label = btn.dataset.tabLabel ?? "";
        select(g, i);
        applyLabel(label);
        try {
          localStorage.setItem(TAB_PREF_KEY, label);
        } catch {
          // Storage unavailable — the choice just won't persist.
        }
      });
    });
  });

  try {
    const saved = localStorage.getItem(TAB_PREF_KEY);
    if (saved) applyLabel(saved);
  } catch {
    // ignore
  }
}

// ─── Image lightbox ─────────────────────────────────────────────────────────

function wireLightbox(container: HTMLElement): void {
  const content = container.querySelector<HTMLElement>("#blog-content");
  if (!content) return;
  content.addEventListener("click", (e) => {
    const img = (e.target as HTMLElement).closest<HTMLImageElement>("img");
    if (!img || img.closest("a")) return;
    const overlay = document.createElement("div");
    overlay.className = "blog-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", img.alt || "Image");
    const big = document.createElement("img");
    big.src = img.currentSrc || img.src;
    big.alt = img.alt;
    overlay.appendChild(big);
    if (img.alt) {
      const caption = document.createElement("p");
      caption.textContent = img.alt;
      overlay.appendChild(caption);
    }
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
  });
}

function wireHeadingAnchors(container: HTMLElement): void {
  container.querySelectorAll<HTMLAnchorElement>(".blog-heading-anchor").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = a.dataset.anchor;
      if (!id) return;
      const url = `${location.origin}${location.pathname}${location.search}#${id}`;
      history.replaceState(history.state, "", url);
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        await navigator.clipboard.writeText(url);
        a.classList.add("copied");
        setTimeout(() => a.classList.remove("copied"), 1200);
      } catch {
        // Clipboard unavailable — the URL bar still has the link.
      }
    });
  });
  // Deep link: /blog?slug=x#some-heading
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) requestAnimationFrame(() => container.querySelector<HTMLElement>(`#${CSS.escape(hash)}`)?.scrollIntoView({ block: "start" }));
}

// ─── Table of contents ──────────────────────────────────────────────────────
// Links use href="javascript:void(0)" and scroll manually instead of a real
// "#id" fragment link, so clicking one smooth-scrolls the heading into view
// instead of jumping instantly.

function wireToc(container: HTMLElement): void {
  container.querySelectorAll<HTMLAnchorElement>(".blog-toc-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.dataset.tocTarget;
      const target = id ? container.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// ─── Reading progress bar ───────────────────────────────────────────────────

function wireProgressBar(container: HTMLElement): void {
  if (detachProgressBar) {
    detachProgressBar();
    detachProgressBar = null;
  }

  const bar = container.querySelector<HTMLElement>("#blog-progress-bar");
  const content = container.querySelector<HTMLElement>("#blog-content");
  if (!bar || !content) return;

  const onScroll = () => {
    const rect = content.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const scrolled = -rect.top;
    const pct = total > 0 ? Math.min(100, Math.max(0, (scrolled / total) * 100)) : 0;
    bar.style.width = `${pct}%`;
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  detachProgressBar = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}

// ─── Share buttons ───────────────────────────────────────────────────────────

function wireShareButtons(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>("[data-copy-link]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.copyLink;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        const original = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = original), 1500);
      } catch {
        // Clipboard API unavailable.
      }
    });
  });
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

  const submitBtn = form.querySelector<HTMLButtonElement>(".contact-submit")!;
  renderTurnstileWidget(form, () => { submitBtn.disabled = false; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = container.querySelector<HTMLInputElement>("#bc-name")!.value.trim();
    const message = container.querySelector<HTMLTextAreaElement>("#bc-message")!.value.trim();
    const turnstileToken = getTurnstileToken(form);
    if (!name || !message || !turnstileToken) return;

    submitBtn.disabled = true;
    status.style.display = "none";
    try {
      await submitComment(slug, name, message, turnstileToken);
      status.textContent = "Thanks — your comment is awaiting review and will appear once approved.";
      status.className = "contact-status contact-status-ok";
      status.style.display = "block";
      form.reset();
    } catch {
      status.textContent = "Something went wrong posting that — please try again.";
      status.className = "contact-status contact-status-err";
      status.style.display = "block";
    } finally {
      resetTurnstileWidget(form);
      submitBtn.disabled = true;
    }
  });
}

// ─── Run session (lets a solved Turnstile challenge cover many runs) ───────
// The backend hands back a signed, time- and count-bounded session token
// after the first successful verification; we stash it for the tab's
// lifetime so readers aren't asked to re-solve Turnstile on every run.

const RUN_SESSION_KEY = "blog-code-run-session";

interface RunSession {
  token: string;
  expiresAt: number;
}

function getRunSession(): RunSession | null {
  try {
    const raw = sessionStorage.getItem(RUN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunSession>;
    if (!parsed.token || typeof parsed.expiresAt !== "number" || Date.now() >= parsed.expiresAt) return null;
    return parsed as RunSession;
  } catch {
    return null;
  }
}

function setRunSession(token: string, expiresAt: number): void {
  try {
    sessionStorage.setItem(RUN_SESSION_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    // Storage unavailable (private mode, quota) — session just won't persist.
  }
}

function clearRunSession(): void {
  try {
    sessionStorage.removeItem(RUN_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Runs code using the shared session if we have one, else the panel's solved Turnstile token. */
async function executeCode(
  runPanel: HTMLElement | null | undefined,
  compilerId: string,
  sourceCode: string,
  stdin: string,
): Promise<CompilerResult> {
  const session = getRunSession();
  const turnstileToken = session ? undefined : (runPanel ? getTurnstileToken(runPanel) : undefined);

  const result = await runCode(compilerId, sourceCode, stdin, {
    runSession: session?.token,
    turnstileToken,
  });

  if (result.session && result.sessionExpiresAt) {
    setRunSession(result.session, result.sessionExpiresAt);
  }

  return result;
}

function wireRunnableCode(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".blog-run-panel").forEach((panel) => {
    const id = panel.dataset.runId;
    const btn = panel.querySelector<HTMLButtonElement>('[data-run-action="run"]');
    const status = panel.querySelector<HTMLElement>(".blog-run-status");
    const stdinInput = panel.querySelector<HTMLTextAreaElement>(".blog-run-stdin-input");
    const output = panel.querySelector<HTMLElement>(".blog-run-output");
    const turnstileEl = panel.querySelector<HTMLElement>(".cf-turnstile");

    if (!id || !btn || !status || !output) return;

    const testcasesPanel = container.querySelector<HTMLElement>(`.blog-testcases-panel[data-testcases-for="${id}"]`);
    const tcRunBtn = testcasesPanel?.querySelector<HTMLButtonElement>("[data-tc-run]");

    const unlockRunning = () => {
      btn.disabled = false;
      if (tcRunBtn) tcRunBtn.disabled = false;
      if (turnstileEl) turnstileEl.hidden = true;
    };

    // A verification-required response (no/expired/exhausted session) lands here,
    // whether it came from this panel's own run or a paired test-case run.
    const requireVerification = (message?: string) => {
      clearRunSession();
      btn.disabled = true;
      if (tcRunBtn) tcRunBtn.disabled = true;
      if (status && message) status.textContent = message;
      if (turnstileEl) {
        turnstileEl.hidden = false;
        if (turnstileEl.dataset.tsRendered === "1") {
          (window as any).turnstile?.reset(turnstileEl.dataset.tsWidgetId);
        } else {
          renderTurnstileWidget(panel, unlockRunning);
        }
      }
    };
    panel.addEventListener("blog-run-verify", ((e: CustomEvent<string>) => requireVerification(e.detail)) as EventListener);

    if (getRunSession()) {
      unlockRunning();
    } else {
      renderTurnstileWidget(panel, unlockRunning);
    }

    btn.addEventListener("click", async () => {
      const block = codeBlocksRegistry.get(id);
      if (!block || !block.compilerId) return;

      const editor = editorInstances.get(id);
      const sourceCode = editor ? editor.getValue() : block.code;

      btn.disabled = true;
      status.textContent = "Running…";
      output.hidden = true;

      try {
        const result = await executeCode(panel, block.compilerId, sourceCode, stdinInput?.value ?? "");

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
        btn.disabled = false;
        if (tcRunBtn) tcRunBtn.disabled = false;
      } catch (err) {
        console.error("Execution error:", err);
        if (err instanceof VerificationRequiredError) {
          requireVerification("Please verify you're human again to keep running code.");
        } else {
          status.textContent = `API Error: ${err instanceof Error ? err.message : "Unknown"}`;
          btn.disabled = false;
          if (tcRunBtn) tcRunBtn.disabled = false;
        }
      }
    });
  });
}

// ─── YouTube IFrame Player API loader ──────────────────────────────────────
let ytApiPromise: Promise<typeof window.YT> | null = null;

function loadYouTubeApi(): Promise<typeof window.YT> {
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    if ((window as any).YT?.Player) {
      resolve((window as any).YT);
      return;
    }
    const prevReady = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve((window as any).YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

function wireFloatingVideos(container: HTMLElement): void {
  const wrappers = container.querySelectorAll<HTMLElement>(".blog-video-embed");
  if (!wrappers.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const wrapper = entry.target as HTMLElement;
        const iframe = wrapper.querySelector("iframe");
        if (!iframe) return;

        wrapper.dataset.inView = entry.isIntersecting ? "1" : "0";

        if (entry.isIntersecting) {
          wrapper.dataset.dismissed = "0";
          iframe.classList.remove("floating");
        } else if (wrapper.dataset.dismissed !== "1" && wrapper.dataset.playing === "1") {
          iframe.classList.add("floating");
        }
      });
    },
    { threshold: 0 } 
  );

  wrappers.forEach((w) => {
    w.dataset.dismissed = "0";
    w.dataset.playing = "0";
    w.dataset.inView = "1";
    observer.observe(w);

    const closeBtn = w.querySelector<HTMLButtonElement>(".blog-video-close");
    const iframe = w.querySelector<HTMLIFrameElement>("iframe");
    closeBtn?.addEventListener("click", () => {
      w.dataset.dismissed = "1";
      iframe?.classList.remove("floating");
    });

    if (!iframe?.id) return;
    loadYouTubeApi().then((YT) => {
      new YT.Player(iframe.id, {
        events: {
          onStateChange: (event: { data: number }) => {
            const isPlaying = event.data === YT.PlayerState.PLAYING;
            w.dataset.playing = isPlaying ? "1" : "0";

            if (isPlaying && w.dataset.inView === "0" && w.dataset.dismissed !== "1") {
              iframe.classList.add("floating");
            } else if (!isPlaying) {
              iframe.classList.remove("floating");
            }
          },
        },
      });
    });
  });
}

// ─── Bin-packing algorithm visualizations (:::binviz) ───────────────────────
function wireAlgoViz(container: HTMLElement): void {
  const figures = container.querySelectorAll<HTMLElement>(".blog-binviz");
  if (!figures.length) return;

  figures.forEach((figure) => {
    const config = binVizRegistry.get(figure.id);
    const canvas = figure.querySelector<HTMLElement>("[data-binviz-canvas]");
    const status = figure.querySelector<HTMLElement>("[data-binviz-status]");
    const stepBtn = figure.querySelector<HTMLButtonElement>('[data-binviz-action="step"]');
    const playBtn = figure.querySelector<HTMLButtonElement>('[data-binviz-action="play"]');
    const resetBtn = figure.querySelector<HTMLButtonElement>('[data-binviz-action="reset"]');
    if (!config || !canvas || !status || !stepBtn || !playBtn || !resetBtn) return;

    let controller: BinVizController = mountBinPackingViz(canvas, config);
    let playTimer: number | null = null;

    const stopPlaying = () => {
      if (playTimer !== null) {
        window.clearInterval(playTimer);
        activeBinVizPlayTimers = activeBinVizPlayTimers.filter((id) => id !== playTimer);
        playTimer = null;
      }
      playBtn.textContent = "Play ▶";
    };

    const refreshStatus = () => {
      status.textContent = controller.describeStep();
      const done = controller.isDone();
      stepBtn.disabled = done;
      playBtn.disabled = done;
      if (done) stopPlaying();
    };

    stepBtn.addEventListener("click", () => {
      controller.stepForward();
      refreshStatus();
    });

    playBtn.addEventListener("click", () => {
      if (playTimer !== null) {
        stopPlaying();
        return;
      }
      playBtn.textContent = "Pause";
      playTimer = window.setInterval(() => {
        const advanced = controller.stepForward();
        refreshStatus();
        if (!advanced) stopPlaying();
      }, 900);
      activeBinVizPlayTimers.push(playTimer);
    });

    resetBtn.addEventListener("click", () => {
      stopPlaying();
      controller.reset();
      refreshStatus();
    });

    refreshStatus();
  });
}

function getRelatedPostsHtml(current: BlogPost): string {
  const otherPosts = getRelatedPosts(current, 2);
  
  if (otherPosts.length === 0) return "";

  const rowsHtml = otherPosts.map(p => {
    const thumb = p.cover
      ? `<div class="blog-row-thumb"><img src="${esc(p.cover)}" alt="" loading="lazy"/></div>`
      : "";

    const tags = p.tags.length
      ? `<p class="blog-row-tags">${p.tags.map((t) => esc(t)).join(" · ")}</p>`
      : "";

    return `
      <a class="blog-row" href="/blog?slug=${encodeURIComponent(p.slug)}">
        <div class="blog-row-body">
          ${p.date ? `<div class="blog-row-date">${esc(formatBlogDate(p.date))} · ${estimateReadingMinutes(p.rawBody)} min read</div>` : ""}
          <h3 class="blog-row-title">${esc(p.title)}</h3>
          ${p.excerpt ? `<p class="blog-row-excerpt">${esc(p.excerpt)}</p>` : ""}
          ${tags}
        </div>
        ${thumb}
      </a>`;
  }).join("");

  return `
    <div class="blog-read-more" style="margin-top: 3rem; padding-top: 1.5rem; border-top: 0.6px solid var(--border);">
      <h3 class="section" style="margin-top: 0; border: none; padding: 0;">Related posts</h3>
      <div class="blog-list" style="margin-top: 1rem;">
        ${rowsHtml}
      </div>
    </div>
  `;
}
