// Blog posts tab: a list of existing posts (Edit / Delete) plus a composer
// (frontmatter fields + markdown body) rendered live through the exact same
// renderMarkdown() pipeline the real blog uses (marked + highlight.js +
// KaTeX + DOMPurify + the :::spoiler/:::youtube/:::testcases/:::binviz
// extensions), so what you see here is what the post will actually look
// like — not an approximation.
//
// Publish commits src/data/blogs/<slug>.md straight to GitHub via the
// github-publish edge function, which triggers the site's existing build
// pipeline — the post is live once that deploy finishes (~1-2 min). "Copy
// markdown" is kept as a manual fallback. The post list itself comes from a
// live GitHub directory listing (not the build-time BLOG_POSTS bundle), so
// a publish or delete shows up immediately — only title/date display falls
// back to "(slug)" for a post whose metadata hasn't made it through a
// rebuild yet.

import { supabase, loadAllSiteImages, type DBSiteImage } from "../lib/supabase";
import { publishBlogPostToGithub, uploadImageToGithub, publishLatexToGithub } from "../lib/admin-publish";
import { renderMarkdownHelp } from "../lib/markdown-help";
import { confirmDialog } from "../lib/confirm-dialog";
import { BLOG_POSTS } from "../lib/blog";

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

/** Frontmatter keys this form edits; anything else in a loaded post is kept as-is. */
const FORM_KEYS = ["title", "date", "updated", "tags", "cover", "excerpt", "series", "pdf"] as const;

function buildMarkdownFile(fields: {
  title: string; date: string; updated: string; tags: string; cover: string; excerpt: string;
  series: string; pdf: string; body: string; extra: Record<string, string>;
}): string {
  const lines = ["---", `title: ${fields.title}`, `date: ${fields.date}`];
  for (const key of ["updated", "tags", "cover", "excerpt", "series", "pdf"] as const) {
    if (fields[key].trim()) lines.push(`${key}: ${fields[key].trim()}`);
  }
  for (const [key, value] of Object.entries(fields.extra)) lines.push(`${key}: ${value}`);
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
      <h3>Existing posts</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Title</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody id="be-post-list"><tr><td colspan="3" class="admin-table-empty">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="admin-form-section">
      <h3 id="be-composer-heading">New blog post</h3>
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
        <div class="admin-form-row">
          <div><label>Updated (optional)</label><input type="text" id="be-updated" placeholder="YYYY-MM-DD"/></div>
          <div><label>Series (optional)</label><input type="text" id="be-series" placeholder="Posts with the same name are linked"/></div>
        </div>
        <div>
          <label>PDF (optional — shows a download icon on the post)</label>
          <div style="display:flex;gap:0.4rem;align-items:center;">
            <input type="text" id="be-pdf" placeholder="Upload the PDF compiled in Overleaf" style="flex:1;"/>
            <input type="file" id="be-pdf-upload" accept="application/pdf,.pdf" style="display:none;"/>
            <button type="button" class="admin-btn" id="be-pdf-upload-btn">Upload PDF…</button>
          </div>
        </div>
      </div>
    </div>

    ${renderMarkdownHelp("blog")}

    <div class="admin-editor-split">
      <div class="admin-editor-pane">
        <label class="admin-editor-pane-label">Markdown</label>
        <textarea id="be-body" class="admin-editor-textarea" placeholder="## Heading&#10;&#10;Write the post here — code fences, :::spoiler, :::testcases, :::youtube, :::binviz, KaTeX ($...$), all supported. See the writing guide above."></textarea>
      </div>
      <div class="admin-editor-pane">
        <label class="admin-editor-pane-label">Live preview</label>
        <div class="admin-editor-preview">
          <div class="blog-content" id="be-preview"></div>
        </div>
      </div>
    </div>

    <details class="admin-form-section admin-latex" id="be-latex" open>
      <summary><h3 style="display:inline;">LaTeX export</h3> <span class="edu-note">— for a typeset PDF of this post</span></summary>
      <ol class="admin-latex-steps">
        <li><b>Automatic:</b> click <b>Compile &amp; publish PDF</b>. GitHub compiles it with TeX Live, attaches the PDF to the post and redeploys (~3 min). Progress shows below.</li>
        <li><b>To tweak it by hand first:</b> <b>Open in Overleaf</b> (or <b>Download Overleaf project (.zip)</b> → Overleaf <b>New Project → Upload Project</b>), edit, download the PDF, then <b>Upload PDF…</b> above and <b>Update on GitHub</b>.</li>
      </ol>
      <p class="edu-note" style="margin-top:-0.3rem;">Updating an existing Overleaf project instead? Use <b>Copy</b> to replace <code>main.tex</code> and upload any new images from the list below.</p>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn admin-btn-primary" id="be-latex-compile">Compile &amp; publish PDF</button>
        <button type="button" class="admin-btn" id="be-latex-gen">Generate LaTeX</button>
        <button type="button" class="admin-btn" id="be-latex-overleaf">Open in Overleaf</button>
        <button type="button" class="admin-btn" id="be-latex-zip" disabled>Download Overleaf project (.zip)</button>
        <button type="button" class="admin-btn" id="be-latex-copy" disabled>Copy</button>
        <button type="button" class="admin-btn" id="be-latex-download" disabled>Download .tex</button>
      </div>
      <div id="be-latex-progress" class="admin-latex-progress" hidden></div>
      <div id="be-latex-info"></div>
      <textarea id="be-latex-out" class="admin-editor-textarea admin-latex-out" readonly spellcheck="false" placeholder="Generated LaTeX appears here." style="display:none;"></textarea>
      <details class="admin-latex-rules">
        <summary>Conversion rules</summary>
        <ul>
          <li><code>##</code> → <code>\section</code>, <code>###</code> → <code>\subsection</code>, deeper → <code>\paragraph</code>. The post title, author, link, dates, tags and excerpt form the title block.</li>
          <li>Bold/italic/inline code → <code>\textbf</code>/<code>\emph</code>/<code>\texttt</code>. Links → <code>\href</code> (site links made absolute).</li>
          <li>Math <code>$…$</code> / <code>$$…$$</code> is copied verbatim — stick to standard LaTeX commands.</li>
          <li>Code blocks → <code>listings</code> (C++, C, Python, Java, SQL, Bash highlighted). Non-ASCII in code becomes ASCII (<code>→</code> → <code>-&gt;</code>).</li>
          <li>Images → centred figures; alt text becomes the caption. PNG/JPG/PDF only.</li>
          <li>Tables → booktabs; quotes → a ruled box; <code>---</code> → a rule.</li>
          <li><code>:::note/tip/warning/important</code> and <code>:::spoiler</code> → titled boxes (spoilers printed open). <code>:::tabs</code> → each block captioned with its tab label. <code>:::problem</code> → problem card.</li>
          <li><code>:::testcases</code> → input/expected listings, truncated to 8 lines; file-backed cases become links. <code>:::youtube</code>/<code>:::binviz</code> → link to the online post.</li>
          <li>Raw HTML is dropped; characters pdfLaTeX can't typeset (emoji) are removed and listed as warnings.</li>
        </ul>
      </details>
    </details>

    <div class="admin-form-actions" style="margin-top:0.8rem;">
      <button type="button" class="admin-btn admin-btn-primary" id="be-publish">Publish to GitHub</button>
      <button type="button" class="admin-btn" id="be-latex-gen-bar">Generate LaTeX</button>
      <button type="button" class="admin-btn" id="be-copy">Copy markdown file</button>
      <button type="button" class="admin-btn" id="be-cancel-edit" style="display:none;">New post (cancel edit)</button>
      <span id="be-copy-path" class="edu-note" style="margin:0;"></span>
    </div>
    <div id="be-copy-status" class="admin-status" style="display:none;margin-top:0.6rem;"></div>`;

  const composerHeadingEl = el.querySelector<HTMLElement>("#be-composer-heading")!;
  const postListEl = el.querySelector<HTMLElement>("#be-post-list")!;
  const titleEl = el.querySelector<HTMLInputElement>("#be-title")!;
  const slugEl = el.querySelector<HTMLInputElement>("#be-slug")!;
  const dateEl = el.querySelector<HTMLInputElement>("#be-date")!;
  const coverEl = el.querySelector<HTMLSelectElement>("#be-cover")!;
  const coverUploadInput = el.querySelector<HTMLInputElement>("#be-cover-upload")!;
  const coverUploadBtn = el.querySelector<HTMLButtonElement>("#be-cover-upload-btn")!;
  const tagsEl = el.querySelector<HTMLInputElement>("#be-tags")!;
  const excerptEl = el.querySelector<HTMLInputElement>("#be-excerpt")!;
  const updatedEl = el.querySelector<HTMLInputElement>("#be-updated")!;
  const seriesEl = el.querySelector<HTMLInputElement>("#be-series")!;
  const pdfEl = el.querySelector<HTMLInputElement>("#be-pdf")!;
  const pdfUploadInput = el.querySelector<HTMLInputElement>("#be-pdf-upload")!;
  const pdfUploadBtn = el.querySelector<HTMLButtonElement>("#be-pdf-upload-btn")!;
  const bodyEl = el.querySelector<HTMLTextAreaElement>("#be-body")!;
  const previewEl = el.querySelector<HTMLElement>("#be-preview")!;
  const publishBtn = el.querySelector<HTMLButtonElement>("#be-publish")!;
  const copyBtn = el.querySelector<HTMLButtonElement>("#be-copy")!;
  const cancelEditBtn = el.querySelector<HTMLButtonElement>("#be-cancel-edit")!;
  const copyPathEl = el.querySelector<HTMLElement>("#be-copy-path")!;
  const copyStatusEl = el.querySelector<HTMLElement>("#be-copy-status")!;

  let editingSlug: string | null = null;
  /** Frontmatter keys from a loaded post that the form doesn't edit (kept on save). */
  let extraFrontmatter: Record<string, string> = {};
  let slugTouched = false;

  slugEl.addEventListener("input", () => { slugTouched = true; });
  titleEl.addEventListener("input", () => {
    if (!slugTouched) slugEl.value = slugify(titleEl.value);
    updatePath();
  });
  slugEl.addEventListener("input", updatePath);

  function updatePath(): void {
    const slug = editingSlug ?? (slugEl.value.trim() || "your-post-slug");
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

  pdfUploadBtn.addEventListener("click", () => pdfUploadInput.click());
  pdfUploadInput.addEventListener("change", async () => {
    const file = pdfUploadInput.files?.[0];
    if (!file) return;
    const slug = editingSlug ?? (slugEl.value.trim() || slugify(titleEl.value));
    if (!slug) {
      setStatus("Set a title or slug before uploading the PDF.", false);
      pdfUploadInput.value = "";
      return;
    }
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== "%PDF-") {
      setStatus("That file isn't a PDF.", false);
      pdfUploadInput.value = "";
      return;
    }
    pdfUploadBtn.disabled = true;
    pdfUploadBtn.textContent = "Uploading…";
    try {
      // Fixed name per post, so re-uploading a revised PDF replaces the old one.
      const { src } = await uploadImageToGithub(new File([file], `${slug}.pdf`, { type: "application/pdf" }));
      pdfEl.value = src;
      setStatus(`PDF uploaded. Click "${editingSlug ? "Update on GitHub" : "Publish to GitHub"}" to show the download icon on the post.`, true);
    } catch (err) {
      setStatus("PDF upload error: " + (err instanceof Error ? err.message : String(err)), false);
    } finally {
      pdfUploadBtn.disabled = false;
      pdfUploadBtn.textContent = "Upload PDF…";
      pdfUploadInput.value = "";
    }
  });

  const latexOut = el.querySelector<HTMLTextAreaElement>("#be-latex-out")!;
  const latexInfo = el.querySelector<HTMLElement>("#be-latex-info")!;
  const latexCopyBtn = el.querySelector<HTMLButtonElement>("#be-latex-copy")!;
  const latexDownloadBtn = el.querySelector<HTMLButtonElement>("#be-latex-download")!;
  const latexZipBtn = el.querySelector<HTMLButtonElement>("#be-latex-zip")!;
  let latexImages: { src: string; file: string }[] = [];
  async function generateLatex(): Promise<void> {
    const f = currentFields();
    const slug = editingSlug ?? (slugEl.value.trim() || slugify(titleEl.value));
    if (!f.title || !f.body.trim() || !slug) {
      setStatus("Title, slug, and body are required before generating LaTeX.", false);
      return;
    }
    const { blogToLatex } = await import("../lib/blog-latex");
    const result = blogToLatex(f.body, {
      slug,
      title: f.title,
      date: f.date,
      updated: f.updated.trim() || undefined,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      excerpt: f.excerpt.trim() || undefined,
    });
    latexOut.value = result.tex;
    latexOut.style.display = "";
    latexCopyBtn.disabled = false;
    latexDownloadBtn.disabled = false;
    latexZipBtn.disabled = false;
    latexImages = result.images;
    const images = result.images.length
      ? `<p><b>Upload these ${result.images.length} image(s) to Overleaf:</b></p><ul>${result.images
          .map((i) => `<li><a href="/${esc(i.src)}" download="${esc(i.file)}" target="_blank" rel="noopener">${esc(i.file)}</a></li>`)
          .join("")}</ul>`
      : `<p class="edu-note">No images to upload.</p>`;
    const warnings = result.warnings.length
      ? `<p><b>Check before compiling:</b></p><ul class="admin-latex-warn">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : "";
    latexInfo.innerHTML = images + warnings;
    const panel = el.querySelector<HTMLDetailsElement>("#be-latex")!;
    panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  el.querySelector<HTMLButtonElement>("#be-latex-gen")!.addEventListener("click", () => void generateLatex());
  el.querySelector<HTMLButtonElement>("#be-latex-gen-bar")!.addEventListener("click", () => void generateLatex());
  latexZipBtn.addEventListener("click", async () => {
    const slug = editingSlug ?? (slugEl.value.trim() || "post");
    latexZipBtn.disabled = true;
    const label = latexZipBtn.textContent;
    latexZipBtn.textContent = "Packing…";
    try {
      const missing: string[] = [];
      const images = await Promise.all(
        latexImages.map(async (img) => {
          try {
            const res = await fetch(`/${img.src}`);
            if (!res.ok) throw new Error(String(res.status));
            return { name: img.file, bytes: new Uint8Array(await res.arrayBuffer()) };
          } catch {
            missing.push(img.file);
            return null;
          }
        }),
      );
      const { downloadZip } = await import("../lib/testcase-files");
      downloadZip(
        [{ name: "main.tex", text: latexOut.value }, ...images.filter((f): f is { name: string; bytes: Uint8Array<ArrayBuffer> } => f !== null)],
        `${slug}-overleaf.zip`,
      );
      setStatus(
        missing.length
          ? `Zip downloaded, but couldn't fetch: ${missing.join(", ")} — add those to Overleaf by hand.`
          : `Zip downloaded — in Overleaf use New Project → Upload Project.`,
        missing.length === 0,
      );
    } finally {
      latexZipBtn.disabled = false;
      latexZipBtn.textContent = label;
    }
  });
  // ── Compile on GitHub Actions ────────────────────────────────────────────
  const REPO_API = "https://api.github.com/repos/PriyanshuIITGHY2006/priyanshuiitghy2006.github.io";
  const progressEl = el.querySelector<HTMLElement>("#be-latex-progress")!;
  const compileBtn = el.querySelector<HTMLButtonElement>("#be-latex-compile")!;
  let pollTimer: number | undefined;

  function showProgress(html: string): void {
    progressEl.hidden = false;
    progressEl.innerHTML = html;
  }

  /** Polls the public Actions API for the newest run of a workflow created after `since`. */
  async function latestRun(workflow: string, since: number): Promise<{ status: string; conclusion: string | null; html_url: string } | null> {
    const res = await fetch(`${REPO_API}/actions/workflows/${workflow}/runs?branch=Website&per_page=5`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[] };
    return data.workflow_runs.find((r) => Date.parse(r.created_at) >= since - 60_000) ?? null;
  }

  function watchCompile(slug: string, since: number): void {
    window.clearTimeout(pollTimer);
    let stage: "compile" | "deploy" = "compile";
    let tries = 0;
    const tick = async () => {
      if (!progressEl.isConnected) return;
      tries++;
      try {
        const run = await latestRun(stage === "compile" ? "latex-pdf.yml" : "static.yml", since);
        const link = run ? ` <a href="${esc(run.html_url)}" target="_blank" rel="noopener">View log</a>` : "";
        if (stage === "compile") {
          if (!run) showProgress(`Waiting for GitHub to start compiling… <span class="edu-note">(${tries * 10}s)</span>`);
          else if (run.status !== "completed") showProgress(`Compiling <b>${esc(slug)}</b> with TeX Live…${link}`);
          else if (run.conclusion === "success") {
            stage = "deploy";
            pdfEl.value = `gallery-media/${slug}.pdf`;
            showProgress(`PDF compiled and attached. Deploying the site…${link}`);
          } else {
            showProgress(`<span class="admin-latex-warn">Compile failed (${esc(run.conclusion ?? "unknown")}).</span>${link} — the LaTeX log is attached to the run as an artifact.`);
            compileBtn.disabled = false;
            return;
          }
        } else if (run && run.status === "completed") {
          showProgress(
            run.conclusion === "success"
              ? `Done — the PDF is live. <a href="/blog?slug=${encodeURIComponent(slug)}" target="_blank" rel="noopener">Open the post</a> · <a href="/gallery-media/${encodeURIComponent(slug)}.pdf" target="_blank" rel="noopener">Open the PDF</a>`
              : `<span class="admin-latex-warn">PDF committed, but the deploy failed.</span>${link}`,
          );
          compileBtn.disabled = false;
          return;
        }
      } catch {
        // Network hiccup or API rate limit — keep polling.
      }
      if (tries > 60) {
        showProgress(`Still running after 10 minutes — check <a href="https://github.com/PriyanshuIITGHY2006/priyanshuiitghy2006.github.io/actions" target="_blank" rel="noopener">GitHub Actions</a>.`);
        compileBtn.disabled = false;
        return;
      }
      pollTimer = window.setTimeout(tick, 10_000);
    };
    void tick();
  }

  compileBtn.addEventListener("click", async () => {
    const slug = editingSlug;
    if (!slug) {
      setStatus("Publish the post first (or open it with Edit) — the PDF is attached to an existing post.", false);
      return;
    }
    await generateLatex();
    if (!latexOut.value) return;
    if (!(await confirmDialog(`Compile "${slug}" on GitHub and attach the PDF to the live post? This also commits the post's pdf: line.`))) return;
    compileBtn.disabled = true;
    try {
      const since = Date.now();
      await publishLatexToGithub(slug, latexOut.value);
      showProgress("LaTeX committed. Waiting for GitHub to start compiling…");
      watchCompile(slug, since);
    } catch (err) {
      setStatus("Compile error: " + (err instanceof Error ? err.message : String(err)), false);
      compileBtn.disabled = false;
    }
  });

  // ── Open in Overleaf (their documented POST form; images fetched by URL) ──
  el.querySelector<HTMLButtonElement>("#be-latex-overleaf")!.addEventListener("click", async () => {
    await generateLatex();
    if (!latexOut.value) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.overleaf.com/docs";
    form.target = "_blank";
    const add = (name: string, value: string) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    add("encoded_snip[]", encodeURIComponent(latexOut.value));
    add("snip_name[]", "main.tex");
    for (const img of latexImages) {
      add("snip_uri[]", new URL(`/${img.src}`, location.origin).href);
      add("snip_name[]", img.file);
    }
    add("engine", "pdflatex");
    document.body.appendChild(form);
    form.submit();
    form.remove();
  });

  latexCopyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(latexOut.value);
      setStatus("LaTeX copied — paste it into main.tex in Overleaf.", true);
    } catch {
      latexOut.select();
      setStatus("Clipboard unavailable — the code is selected, press Ctrl/Cmd+C.", false);
    }
  });
  latexDownloadBtn.addEventListener("click", () => {
    const slug = editingSlug ?? (slugEl.value.trim() || "post");
    const url = URL.createObjectURL(new Blob([latexOut.value], { type: "text/x-tex" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.tex`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      updated: updatedEl.value,
      series: seriesEl.value,
      pdf: pdfEl.value,
      body: bodyEl.value,
      extra: extraFrontmatter,
    };
  }

  function enterEditMode(slug: string): void {
    editingSlug = slug;
    slugEl.value = slug;
    slugEl.readOnly = true;
    composerHeadingEl.textContent = `Editing: ${slug}`;
    publishBtn.textContent = "Update on GitHub";
    cancelEditBtn.style.display = "";
    updatePath();
  }

  function resetComposer(): void {
    editingSlug = null;
    slugTouched = false;
    titleEl.value = "";
    slugEl.value = "";
    slugEl.readOnly = false;
    dateEl.value = todayISO();
    tagsEl.value = "";
    excerptEl.value = "";
    updatedEl.value = "";
    seriesEl.value = "";
    pdfEl.value = "";
    extraFrontmatter = {};
    latexOut.value = "";
    latexOut.style.display = "none";
    latexInfo.innerHTML = "";
    latexCopyBtn.disabled = true;
    latexDownloadBtn.disabled = true;
    latexZipBtn.disabled = true;
    latexImages = [];
    coverEl.value = "";
    bodyEl.value = "";
    renderPreview();
    composerHeadingEl.textContent = "New blog post";
    publishBtn.textContent = "Publish to GitHub";
    cancelEditBtn.style.display = "none";
    updatePath();
  }

  cancelEditBtn.addEventListener("click", resetComposer);

  publishBtn.addEventListener("click", async () => {
    const fields = currentFields();
    const slug = editingSlug ?? (slugEl.value.trim() || slugify(titleEl.value));
    if (!fields.title || !fields.body.trim() || !slug) {
      setStatus("Title, slug, and body are required before publishing.", false);
      return;
    }
    publishBtn.disabled = true;
    publishBtn.textContent = editingSlug ? "Updating…" : "Publishing…";
    try {
      await publishBlogPostToGithub(slug, buildMarkdownFile(fields));
      setStatus(`Published! "${slug}" will be live once the site finishes redeploying (~1–2 min).`, true);
      enterEditMode(slug);
      void refreshPostList();
    } catch (err) {
      setStatus("Publish error: " + (err instanceof Error ? err.message : String(err)), false);
      publishBtn.textContent = editingSlug ? "Update on GitHub" : "Publish to GitHub";
    } finally {
      publishBtn.disabled = false;
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (!titleEl.value.trim() || !bodyEl.value.trim()) {
      setStatus("Title and body are required before copying.", false);
      return;
    }
    const file = buildMarkdownFile(currentFields());
    const slug = editingSlug ?? (slugEl.value.trim() || slugify(titleEl.value));
    try {
      await navigator.clipboard.writeText(file);
      setStatus(`Copied — save as src/data/blogs/${slug}.md`, true);
    } catch {
      setStatus("Clipboard unavailable — select and copy the text manually.", false);
    }
  });

  async function startEditing(slug: string): Promise<boolean> {
    setStatus(`Loading "${slug}"…`, true);
    try {
      const { readBlogPostFromGithub } = await import("../lib/admin-publish");
      const { exists, content } = await readBlogPostFromGithub(slug);
      if (!exists) {
        setStatus("That post no longer exists on GitHub.", false);
        void refreshPostList();
        return false;
      }
      const { parseFrontmatter } = await import("../lib/blog");
      const { data, body } = parseFrontmatter(content);
      titleEl.value = data.title ?? "";
      dateEl.value = data.date ?? todayISO();
      tagsEl.value = data.tags ?? "";
      excerptEl.value = data.excerpt ?? "";
      updatedEl.value = data.updated ?? "";
      seriesEl.value = data.series ?? "";
      pdfEl.value = data.pdf ?? "";
      extraFrontmatter = Object.fromEntries(
        Object.entries(data).filter(([k]) => !(FORM_KEYS as readonly string[]).includes(k)),
      );
      const coverSrc = data.cover ?? "";
      if (coverSrc && !Array.from(coverEl.options).some((o) => o.value === coverSrc)) {
        const opt = document.createElement("option");
        opt.value = coverSrc;
        opt.textContent = coverSrc;
        coverEl.appendChild(opt);
      }
      coverEl.value = coverSrc;
      bodyEl.value = body;
      renderPreview();
      enterEditMode(slug);
      setStatus(`Loaded "${slug}" for editing.`, true);
      el.querySelector("#be-composer-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    } catch (err) {
      setStatus("Load error: " + (err instanceof Error ? err.message : String(err)), false);
      return false;
    }
  }

  async function deletePost(slug: string, btn: HTMLButtonElement): Promise<void> {
    if (!(await confirmDialog(`Delete blog post "${slug}"? The GitHub file will be removed — this can't be undone.`))) return;
    btn.disabled = true;
    try {
      const { deleteBlogPostFromGithub } = await import("../lib/admin-publish");
      await deleteBlogPostFromGithub(slug);
      if (editingSlug === slug) resetComposer();
      setStatus(`Deleted "${slug}".`, true);
      void refreshPostList();
    } catch (err) {
      setStatus("Delete error: " + (err instanceof Error ? err.message : String(err)), false);
      btn.disabled = false;
    }
  }

  async function refreshPostList(): Promise<void> {
    postListEl.innerHTML = `<tr><td colspan="3" class="admin-table-empty">Loading…</td></tr>`;
    try {
      const { listBlogSlugsFromGithub } = await import("../lib/admin-publish");
      const { files } = await listBlogSlugsFromGithub();
      const knownBySlug = new Map(BLOG_POSTS.map((p) => [p.slug, p]));
      const posts = files
        .map((slug) => ({ slug, title: knownBySlug.get(slug)?.title ?? slug, date: knownBySlug.get(slug)?.date ?? "" }))
        .sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : a.date ? -1 : 1));

      postListEl.innerHTML = posts.length
        ? posts.map((p) => `
          <tr>
            <td class="truncate">${esc(p.title)}</td>
            <td style="white-space:nowrap">${esc(p.date)}</td>
            <td style="white-space:nowrap">
              <button class="admin-btn" data-be-edit="${esc(p.slug)}">Edit</button>
              <button class="admin-btn" data-be-latex="${esc(p.slug)}" title="Load this post and generate its LaTeX">LaTeX</button>
              <button class="admin-btn admin-btn-danger" data-be-del="${esc(p.slug)}">Delete</button>
            </td>
          </tr>`).join("")
        : `<tr><td colspan="3" class="admin-table-empty">No posts yet.</td></tr>`;

      postListEl.querySelectorAll<HTMLButtonElement>("[data-be-edit]").forEach((btn) => {
        btn.addEventListener("click", () => void startEditing(btn.dataset.beEdit!));
      });
      postListEl.querySelectorAll<HTMLButtonElement>("[data-be-latex]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (await startEditing(btn.dataset.beLatex!)) await generateLatex();
        });
      });
      postListEl.querySelectorAll<HTMLButtonElement>("[data-be-del]").forEach((btn) => {
        btn.addEventListener("click", () => void deletePost(btn.dataset.beDel!, btn));
      });
    } catch (err) {
      postListEl.innerHTML = `<tr><td colspan="3" class="admin-table-empty">Couldn't load posts: ${esc(err instanceof Error ? err.message : String(err))}</td></tr>`;
    }
  }

  function setStatus(msg: string, ok: boolean): void {
    copyStatusEl.textContent = msg;
    copyStatusEl.className = `admin-status ${ok ? "admin-status-ok" : "admin-status-err"}`;
    copyStatusEl.style.display = "block";
    if (ok) setTimeout(() => { copyStatusEl.style.display = "none"; }, 4000);
  }

  void refreshPostList();
}
