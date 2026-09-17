// Compose-a-blog-post tab: frontmatter fields + a markdown body, rendered
// live through the exact same renderMarkdown() pipeline the real blog uses
// (marked + highlight.js + KaTeX + DOMPurify + the :::spoiler/:::youtube/
// :::gist/:::binviz extensions), so what you see here is what the post will
// actually look like — not an approximation.
//
// This does not publish anywhere yet (no GitHub write path exists) — it
// assembles the exact markdown file a real post needs and lets you copy it,
// matching the frontmatter format src/lib/blog.ts already parses. Once a
// GitHub-push path exists, the "Publish" step just swaps in for "Copy".

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMarkdownFile(fields: {
  title: string; date: string; tags: string; cover: string; excerpt: string; body: string;
}): string {
  const lines = ["---", `title: ${fields.title}`, `date: ${fields.date}`];
  if (fields.tags.trim()) lines.push(`tags: ${fields.tags.trim()}`);
  if (fields.cover.trim()) lines.push(`cover: ${fields.cover.trim()}`);
  if (fields.excerpt.trim()) lines.push(`excerpt: ${fields.excerpt.trim()}`);
  lines.push("---", "", fields.body.trim(), "");
  return lines.join("\n");
}

export async function renderBlogEditor(el: HTMLElement): Promise<void> {
  await Promise.all([
    import("../styles/blog.css"),
    import("katex/dist/katex.min.css"),
  ]);

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>New blog post</h3>
      <p class="edu-note" style="margin-top:-0.4rem;">
        This doesn't publish yet — it renders a live preview through the real blog pipeline and gives you
        a ready-to-commit markdown file for <code>src/data/blogs/&lt;slug&gt;.md</code>.
      </p>
      <div class="admin-form">
        <div class="admin-form-row">
          <div><label>Title</label><input type="text" id="be-title" placeholder="Why My Cache Keeps Missing"/></div>
          <div><label>Slug</label><input type="text" id="be-slug" placeholder="auto-generated-from-title"/></div>
        </div>
        <div class="admin-form-row">
          <div><label>Date</label><input type="text" id="be-date" value="${esc(todayISO())}"/></div>
          <div><label>Cover (path, optional)</label><input type="text" id="be-cover" placeholder="blogs/my-post/cover.jpg"/></div>
        </div>
        <div><label>Tags (comma-separated)</label><input type="text" id="be-tags" placeholder="C++, Performance, Data Structures"/></div>
        <div><label>Excerpt</label><input type="text" id="be-excerpt" placeholder="One or two sentences shown on the blog list card"/></div>
      </div>
    </div>

    <div class="admin-editor-split">
      <div class="admin-editor-pane">
        <label class="admin-editor-pane-label">Markdown</label>
        <textarea id="be-body" class="admin-editor-textarea" placeholder="## Heading&#10;&#10;Write the post here — code fences, :::spoiler, :::gist owner/id, KaTeX ($...$), all supported."></textarea>
      </div>
      <div class="admin-editor-pane">
        <label class="admin-editor-pane-label">Live preview</label>
        <div class="admin-editor-preview">
          <div class="blog-content" id="be-preview"></div>
        </div>
      </div>
    </div>

    <div class="admin-form-actions" style="margin-top:0.8rem;">
      <button type="button" class="admin-btn admin-btn-primary" id="be-copy">Copy markdown file</button>
      <span id="be-copy-path" class="edu-note" style="margin:0;"></span>
    </div>
    <div id="be-copy-status" class="admin-status" style="display:none;margin-top:0.6rem;"></div>`;

  const titleEl = el.querySelector<HTMLInputElement>("#be-title")!;
  const slugEl = el.querySelector<HTMLInputElement>("#be-slug")!;
  const dateEl = el.querySelector<HTMLInputElement>("#be-date")!;
  const coverEl = el.querySelector<HTMLInputElement>("#be-cover")!;
  const tagsEl = el.querySelector<HTMLInputElement>("#be-tags")!;
  const excerptEl = el.querySelector<HTMLInputElement>("#be-excerpt")!;
  const bodyEl = el.querySelector<HTMLTextAreaElement>("#be-body")!;
  const previewEl = el.querySelector<HTMLElement>("#be-preview")!;
  const copyBtn = el.querySelector<HTMLButtonElement>("#be-copy")!;
  const copyPathEl = el.querySelector<HTMLElement>("#be-copy-path")!;
  const copyStatusEl = el.querySelector<HTMLElement>("#be-copy-status")!;

  let slugTouched = false;
  slugEl.addEventListener("input", () => { slugTouched = true; });
  titleEl.addEventListener("input", () => {
    if (!slugTouched) slugEl.value = slugify(titleEl.value);
    updatePath();
  });
  slugEl.addEventListener("input", updatePath);

  function updatePath(): void {
    const slug = slugEl.value.trim() || "your-post-slug";
    copyPathEl.textContent = `→ src/data/blogs/${slug}.md`;
  }
  updatePath();

  const { renderMarkdown } = await import("../lib/blog");

  let debounceId: number | undefined;
  function renderPreview(): void {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => {
      const md = bodyEl.value.trim();
      if (!md) {
        previewEl.innerHTML = `<p class="admin-empty-note">Start typing to see a live preview.</p>`;
        return;
      }
      try {
        previewEl.innerHTML = renderMarkdown(md);
      } catch (err) {
        previewEl.innerHTML = `<p class="blog-testcases-error">Preview error: ${esc(err instanceof Error ? err.message : String(err))}</p>`;
      }
    }, 150);
  }
  bodyEl.addEventListener("input", renderPreview);
  renderPreview();

  copyBtn.addEventListener("click", async () => {
    if (!titleEl.value.trim() || !bodyEl.value.trim()) {
      setStatus("Title and body are required before copying.", false);
      return;
    }
    const file = buildMarkdownFile({
      title: titleEl.value.trim(),
      date: dateEl.value.trim() || todayISO(),
      tags: tagsEl.value,
      cover: coverEl.value,
      excerpt: excerptEl.value,
      body: bodyEl.value,
    });
    try {
      await navigator.clipboard.writeText(file);
      setStatus(`Copied — save as src/data/blogs/${slugEl.value.trim() || slugify(titleEl.value)}.md`, true);
    } catch {
      setStatus("Clipboard unavailable — select and copy the text manually.", false);
    }
  });

  function setStatus(msg: string, ok: boolean): void {
    copyStatusEl.textContent = msg;
    copyStatusEl.className = `admin-status ${ok ? "admin-status-ok" : "admin-status-err"}`;
    copyStatusEl.style.display = "block";
    if (ok) setTimeout(() => { copyStatusEl.style.display = "none"; }, 4000);
  }
}
