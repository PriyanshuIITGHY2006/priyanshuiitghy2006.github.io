// Compose-a-blog-post tab: frontmatter fields + a markdown body, rendered
// live through the exact same renderMarkdown() pipeline the real blog uses
// (marked + highlight.js + KaTeX + DOMPurify + the :::spoiler/:::youtube/
// :::gist/:::binviz extensions), so what you see here is what the post will
// actually look like — not an approximation.
//
// Publish commits src/data/blogs/<slug>.md straight to GitHub via the
// github-publish edge function, which triggers the site's existing build
// pipeline — the post is live once that deploy finishes (~1-2 min). "Copy
// markdown" is kept as a manual fallback.

import { supabase, loadAllSiteImages, type DBSiteImage } from "../lib/supabase";
import { publishBlogPostToGithub, uploadImageToGithub } from "../lib/admin-publish";

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

function coverOptionsHtml(images: DBSiteImage[], selectedSrc: string): string {
  const options = images
    .map((img) => `<option value="${esc(img.src)}" ${img.src === selectedSrc ? "selected" : ""}>${esc(img.title)}</option>`)
    .join("");
  return `<option value="">— none —</option>${options}`;
}

export async function renderBlogEditor(el: HTMLElement): Promise<void> {
  const [, , images] = await Promise.all([
    import("../styles/blog.css"),
    import("katex/dist/katex.min.css"),
    loadAllSiteImages(),
  ]);

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>New blog post</h3>
      <p class="edu-note" style="margin-top:-0.4rem;">
        Publish commits the post straight to GitHub — it's live once the next deploy finishes (~1–2 min).
      </p>
      <div class="admin-form">
        <div class="admin-form-row">
          <div><label>Title</label><input type="text" id="be-title" placeholder="Why My Cache Keeps Missing"/></div>
          <div><label>Slug</label><input type="text" id="be-slug" placeholder="auto-generated-from-title"/></div>
        </div>
        <div class="admin-form-row">
          <div><label>Date</label><input type="text" id="be-date" value="${esc(todayISO())}"/></div>
          <div>
            <label>Cover (optional)</label>
            <div style="display:flex;gap:0.4rem;align-items:center;">
              <select id="be-cover" style="flex:1;">${coverOptionsHtml(images, "")}</select>
              <input type="file" id="be-cover-upload" accept="image/*" style="display:none;"/>
              <button type="button" class="admin-btn" id="be-cover-upload-btn">Upload new…</button>
            </div>
          </div>
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
      <button type="button" class="admin-btn admin-btn-primary" id="be-publish">Publish to GitHub</button>
      <button type="button" class="admin-btn" id="be-copy">Copy markdown file</button>
      <span id="be-copy-path" class="edu-note" style="margin:0;"></span>
    </div>
    <div id="be-copy-status" class="admin-status" style="display:none;margin-top:0.6rem;"></div>`;

  const titleEl = el.querySelector<HTMLInputElement>("#be-title")!;
  const slugEl = el.querySelector<HTMLInputElement>("#be-slug")!;
  const dateEl = el.querySelector<HTMLInputElement>("#be-date")!;
  const coverEl = el.querySelector<HTMLSelectElement>("#be-cover")!;
  const coverUploadInput = el.querySelector<HTMLInputElement>("#be-cover-upload")!;
  const coverUploadBtn = el.querySelector<HTMLButtonElement>("#be-cover-upload-btn")!;
  const tagsEl = el.querySelector<HTMLInputElement>("#be-tags")!;
  const excerptEl = el.querySelector<HTMLInputElement>("#be-excerpt")!;
  const bodyEl = el.querySelector<HTMLTextAreaElement>("#be-body")!;
  const previewEl = el.querySelector<HTMLElement>("#be-preview")!;
  const publishBtn = el.querySelector<HTMLButtonElement>("#be-publish")!;
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

  coverUploadBtn.addEventListener("click", () => coverUploadInput.click());
  coverUploadInput.addEventListener("change", async () => {
    const file = coverUploadInput.files?.[0];
    if (!file) return;
    coverUploadBtn.disabled = true;
    coverUploadBtn.textContent = "Uploading…";
    try {
      const { src } = await uploadImageToGithub(file);
      const { error } = await supabase.from("site_images").upsert({
        id: slugify(file.name.replace(/\.[^./]+$/, "")) || `cover-${Date.now()}`,
        title: file.name,
        src,
        kind: "blog-cover",
        sort_order: 0,
      });
      if (error) throw new Error(error.message);
      const opt = document.createElement("option");
      opt.value = src;
      opt.textContent = file.name;
      opt.selected = true;
      coverEl.appendChild(opt);
      setStatus("Cover uploaded.", true);
    } catch (err) {
      setStatus("Upload error: " + (err instanceof Error ? err.message : String(err)), false);
    } finally {
      coverUploadBtn.disabled = false;
      coverUploadBtn.textContent = "Upload new…";
      coverUploadInput.value = "";
    }
  });

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

  function currentFields() {
    return {
      title: titleEl.value.trim(),
      date: dateEl.value.trim() || todayISO(),
      tags: tagsEl.value,
      cover: coverEl.value,
      excerpt: excerptEl.value,
      body: bodyEl.value,
    };
  }

  publishBtn.addEventListener("click", async () => {
    const fields = currentFields();
    const slug = slugEl.value.trim() || slugify(titleEl.value);
    if (!fields.title || !fields.body.trim() || !slug) {
      setStatus("Title, slug, and body are required before publishing.", false);
      return;
    }
    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      await publishBlogPostToGithub(slug, buildMarkdownFile(fields));
      setStatus(`Published! "${slug}" will be live once the site finishes redeploying (~1–2 min).`, true);
    } catch (err) {
      setStatus("Publish error: " + (err instanceof Error ? err.message : String(err)), false);
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = "Publish to GitHub";
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (!titleEl.value.trim() || !bodyEl.value.trim()) {
      setStatus("Title and body are required before copying.", false);
      return;
    }
    const file = buildMarkdownFile(currentFields());
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
