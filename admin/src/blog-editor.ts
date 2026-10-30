// Posts tab: the list of posts in content/posts/ (Edit / LaTeX / Delete)
// and a composer for the front matter and Markdown body, with a live preview.
//
// Publish commits content/posts/<slug>.md through the github-publish edge
// function. That push triggers the deploy workflow, so the post is live once
// Hugo has rebuilt the site (about 1-2 min). The list comes from GitHub
// directly, so a publish or delete shows up here straight away.

import { supabase, loadAllSiteImages, type DBSiteImage } from "./supabase";
import { publishPost, publishLatex, readPost, deletePost, listPosts, uploadFileToGithub, POSTS_DIR } from "./publish";
import { parsePost, buildPost, type PostFields } from "./frontmatter";
import { renderWritingGuide } from "./writing-guide";
import { confirmDialog } from "./confirm-dialog";
import { esc, setStatus } from "./ui";

const REPO = "PriyanshuIITGHY2006/priyanshuiitghy2006.github.io";

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function coverOptionsHtml(images: DBSiteImage[]): string {
  return `<option value="">None</option>${images.map((img) => `<option value="${esc(img.src)}">${esc(img.title)}</option>`).join("")}`;
}

export async function renderBlogEditor(el: HTMLElement): Promise<void> {
  const images = await loadAllSiteImages();

  el.innerHTML = `
    <section class="card">
      <h3>Posts</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Date</th><th></th></tr></thead>
          <tbody id="be-post-list"><tr><td colspan="3" class="empty">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3 id="be-heading">New post</h3>
      <div class="form">
        <div class="row">
          <label>Title<input type="text" id="be-title" placeholder="Why My Cache Keeps Missing"/></label>
          <label>Slug<input type="text" id="be-slug" placeholder="from the title"/></label>
        </div>
        <div class="row">
          <label>Date<input type="text" id="be-date" value="${esc(todayISO())}"/></label>
          <label>Updated (optional)<input type="text" id="be-lastmod" placeholder="YYYY-MM-DD"/></label>
        </div>
        <label>Tags (comma-separated)<input type="text" id="be-tags" placeholder="C++, Performance"/></label>
        <label>Summary (list card and search engines)<input type="text" id="be-summary" placeholder="One or two sentences"/></label>
        <div class="row">
          <label>Cover (optional)
            <span class="inline">
              <select id="be-cover">${coverOptionsHtml(images.filter((i) => /\.(png|jpe?g|webp|gif)$/i.test(i.src)))}</select>
              <input type="file" id="be-cover-upload" accept="image/*" hidden/>
              <button type="button" class="btn" id="be-cover-upload-btn">Upload…</button>
            </span>
          </label>
          <label>PDF (optional)
            <span class="inline">
              <input type="text" id="be-pdf" placeholder="gallery-media/<slug>.pdf"/>
              <input type="file" id="be-pdf-upload" accept="application/pdf,.pdf" hidden/>
              <button type="button" class="btn" id="be-pdf-upload-btn">Upload…</button>
            </span>
          </label>
        </div>
        <label class="check"><input type="checkbox" id="be-draft"/> Draft (published to GitHub but not shown on the site)</label>
      </div>
    </section>

    ${renderWritingGuide()}

    <div class="editor-split">
      <div class="pane">
        <span class="pane-head">Markdown
          <input type="file" id="be-insert-file" accept="image/*,video/*,audio/*,application/pdf" hidden/>
          <button type="button" class="btn" id="be-insert-btn" title="Upload a file and insert it at the cursor">Insert file…</button>
        </span>
        <textarea id="be-body" class="editor" spellcheck="true" placeholder="## Heading&#10;&#10;Write the post here."></textarea>
      </div>
      <div class="pane">Preview
        <div class="preview" id="be-preview"></div>
      </div>
    </div>

    <div class="actions sticky">
      <button type="button" class="btn primary" id="be-publish">Publish</button>
      <button type="button" class="btn" id="be-copy">Copy Markdown</button>
      <button type="button" class="btn" id="be-new" hidden>New post</button>
      <span id="be-path" class="note"></span>
    </div>
    <div id="be-status" class="status" hidden></div>

    <details class="card latex" id="be-latex">
      <summary><h3>PDF from LaTeX</h3></summary>
      <ol>
        <li><b>Compile &amp; publish PDF</b>: GitHub compiles the post with TeX Live, attaches the PDF and redeploys (about 3 min).</li>
        <li>To edit by hand first: <b>Open in Overleaf</b> or download the project zip, then upload the PDF above and publish.</li>
      </ol>
      <div class="actions">
        <button type="button" class="btn primary" id="be-latex-compile">Compile &amp; publish PDF</button>
        <button type="button" class="btn" id="be-latex-gen">Generate LaTeX</button>
        <button type="button" class="btn" id="be-latex-overleaf">Open in Overleaf</button>
        <button type="button" class="btn" id="be-latex-zip" disabled>Download project (.zip)</button>
        <button type="button" class="btn" id="be-latex-copy" disabled>Copy</button>
      </div>
      <div id="be-latex-progress" class="progress" hidden></div>
      <div id="be-latex-info"></div>
      <textarea id="be-latex-out" class="editor latex-out" readonly spellcheck="false" hidden></textarea>
    </details>`;

  const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`)!;
  const headingEl = $("be-heading");
  const postListEl = $("be-post-list");
  const titleEl = $<HTMLInputElement>("be-title");
  const slugEl = $<HTMLInputElement>("be-slug");
  const dateEl = $<HTMLInputElement>("be-date");
  const lastmodEl = $<HTMLInputElement>("be-lastmod");
  const tagsEl = $<HTMLInputElement>("be-tags");
  const summaryEl = $<HTMLInputElement>("be-summary");
  const coverEl = $<HTMLSelectElement>("be-cover");
  const pdfEl = $<HTMLInputElement>("be-pdf");
  const draftEl = $<HTMLInputElement>("be-draft");
  const bodyEl = $<HTMLTextAreaElement>("be-body");
  const previewEl = $("be-preview");
  const publishBtn = $<HTMLButtonElement>("be-publish");
  const newBtn = $<HTMLButtonElement>("be-new");
  const pathEl = $("be-path");
  const statusEl = $("be-status");
  const status = (msg: string, ok: boolean) => setStatus(statusEl, msg, ok);

  let editingSlug: string | null = null;
  /** Front matter keys from a loaded post that the form doesn't edit (kept on save). */
  let extra: Record<string, unknown> = {};
  let slugTouched = false;

  const currentSlug = () => editingSlug ?? (slugEl.value.trim() || slugify(titleEl.value));

  function currentFields(): PostFields {
    return {
      title: titleEl.value.trim(),
      date: dateEl.value.trim() || todayISO(),
      lastmod: lastmodEl.value,
      tags: tagsEl.value.split(",").map((t) => t.trim()).filter(Boolean),
      summary: summaryEl.value,
      cover: coverEl.value,
      pdf: pdfEl.value,
      draft: draftEl.checked,
      extra,
    };
  }

  function updatePath(): void {
    pathEl.textContent = `${POSTS_DIR}/${currentSlug() || "slug"}.md`;
  }

  slugEl.addEventListener("input", () => { slugTouched = true; updatePath(); });
  titleEl.addEventListener("input", () => {
    if (!slugTouched && !editingSlug) slugEl.value = slugify(titleEl.value);
    updatePath();
  });
  updatePath();

  function selectCover(src: string): void {
    if (src && !Array.from(coverEl.options).some((o) => o.value === src)) {
      coverEl.add(new Option(src, src));
    }
    coverEl.value = src;
  }

  // ── Uploads ────────────────────────────────────────────────────────────
  const coverInput = $<HTMLInputElement>("be-cover-upload");
  const coverBtn = $<HTMLButtonElement>("be-cover-upload-btn");
  coverBtn.addEventListener("click", () => coverInput.click());
  coverInput.addEventListener("change", async () => {
    const file = coverInput.files?.[0];
    if (!file) return;
    coverBtn.disabled = true;
    coverBtn.textContent = "Uploading…";
    try {
      const { src } = await uploadFileToGithub(file);
      const { error } = await supabase.from("site_images").upsert({
        id: slugify(file.name.replace(/\.[^./]+$/, "")) || `cover-${Date.now()}`,
        title: file.name,
        src,
        kind: "blog-cover",
        sort_order: 0,
      });
      if (error) throw new Error(error.message);
      selectCover(src);
      status("Cover uploaded.", true);
    } catch (err) {
      status(`Upload error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      coverBtn.disabled = false;
      coverBtn.textContent = "Upload…";
      coverInput.value = "";
    }
  });

  const pdfInput = $<HTMLInputElement>("be-pdf-upload");
  const pdfBtn = $<HTMLButtonElement>("be-pdf-upload-btn");
  pdfBtn.addEventListener("click", () => pdfInput.click());
  pdfInput.addEventListener("change", async () => {
    const file = pdfInput.files?.[0];
    if (!file) return;
    const slug = currentSlug();
    if (!slug) {
      status("Set a title or slug before uploading the PDF.", false);
      pdfInput.value = "";
      return;
    }
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== "%PDF-") {
      status("That file isn't a PDF.", false);
      pdfInput.value = "";
      return;
    }
    pdfBtn.disabled = true;
    pdfBtn.textContent = "Uploading…";
    try {
      // Fixed name per post, so a revised PDF replaces the old one.
      const { src } = await uploadFileToGithub(new File([file], `${slug}.pdf`, { type: "application/pdf" }));
      pdfEl.value = src;
      status("PDF uploaded. Publish the post to show the download link.", true);
    } catch (err) {
      status(`PDF upload error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = "Upload…";
      pdfInput.value = "";
    }
  });

  // ── Insert file: upload, then put the matching snippet at the cursor ───
  const insertInput = $<HTMLInputElement>("be-insert-file");
  const insertBtn = $<HTMLButtonElement>("be-insert-btn");
  insertBtn.addEventListener("click", () => insertInput.click());
  insertInput.addEventListener("change", async () => {
    const file = insertInput.files?.[0];
    if (!file) return;
    insertBtn.disabled = true;
    insertBtn.textContent = "Uploading…";
    try {
      const { src } = await uploadFileToGithub(file);
      const name = file.name.replace(/\.[^./]+$/, "");
      const { error } = await supabase.from("site_images").upsert({
        id: slugify(name) || `media-${Date.now()}`,
        title: name,
        src,
        kind: "post-media",
        sort_order: 0,
      });
      if (error) throw new Error(error.message);
      const snippet = file.type.startsWith("video/") ? `{{< video src="${src}" caption="${name}" >}}`
        : file.type.startsWith("audio/") ? `{{< audio src="${src}" caption="${name}" >}}`
        : file.type === "application/pdf" ? `[${name} (PDF)](/${src})`
        : `![${name}](${src})`;
      const at = bodyEl.selectionStart ?? bodyEl.value.length;
      bodyEl.setRangeText(`\n${snippet}\n`, at, bodyEl.selectionEnd ?? at, "end");
      bodyEl.focus();
      renderPreviewSoon();
      status("Uploaded and inserted. The file is live after the next deploy (about 1-2 min).", true);
    } catch (err) {
      status(`Upload error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      insertBtn.disabled = false;
      insertBtn.textContent = "Insert file…";
      insertInput.value = "";
    }
  });

  // ── Preview ────────────────────────────────────────────────────────────
  const { renderPreview, hydrateRepoCode, hydrateMermaid } = await import("./preview");
  let debounceId: number | undefined;
  function renderPreviewSoon(): void {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => {
      const src = bodyEl.value.trim();
      try {
        previewEl.innerHTML = src ? renderPreview(src) : `<p class="note">Start typing to see a preview.</p>`;
        hydrateRepoCode(previewEl);
        hydrateMermaid(previewEl);
      } catch (err) {
        previewEl.innerHTML = `<p class="err">Preview error: ${esc(err instanceof Error ? err.message : String(err))}</p>`;
      }
    }, 150);
  }
  bodyEl.addEventListener("input", renderPreviewSoon);
  renderPreviewSoon();

  // ── Publish / edit / delete ────────────────────────────────────────────
  function enterEditMode(slug: string): void {
    editingSlug = slug;
    slugEl.value = slug;
    slugEl.readOnly = true;
    headingEl.textContent = `Editing: ${slug}`;
    publishBtn.textContent = "Update";
    newBtn.hidden = false;
    updatePath();
  }

  function resetComposer(): void {
    editingSlug = null;
    slugTouched = false;
    extra = {};
    for (const input of [titleEl, slugEl, lastmodEl, tagsEl, summaryEl, pdfEl]) input.value = "";
    slugEl.readOnly = false;
    dateEl.value = todayISO();
    draftEl.checked = false;
    coverEl.value = "";
    bodyEl.value = "";
    resetLatex();
    renderPreviewSoon();
    headingEl.textContent = "New post";
    publishBtn.textContent = "Publish";
    newBtn.hidden = true;
    updatePath();
  }
  newBtn.addEventListener("click", resetComposer);

  publishBtn.addEventListener("click", async () => {
    const fields = currentFields();
    const slug = currentSlug();
    if (!fields.title || !bodyEl.value.trim() || !/^[a-z0-9-]+$/.test(slug)) {
      status("A title, a body and a slug of lowercase letters, digits and hyphens are required.", false);
      return;
    }
    if (!editingSlug && (await listPosts()).posts.some((p) => p.slug === slug)) {
      if (!(await confirmDialog(`A post "${slug}" already exists. Replace it?`, "Replace"))) return;
    }
    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      await publishPost(slug, buildPost(fields, bodyEl.value));
      status(`Published. /posts/${slug}/ is live once the deploy finishes (about 1-2 min).`, true);
      enterEditMode(slug);
      void refreshPostList();
    } catch (err) {
      status(`Publish error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = editingSlug ? "Update" : "Publish";
    }
  });

  $<HTMLButtonElement>("be-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildPost(currentFields(), bodyEl.value));
      status(`Copied. Save it as ${POSTS_DIR}/${currentSlug()}.md`, true);
    } catch {
      status("Clipboard unavailable.", false);
    }
  });

  async function startEditing(slug: string): Promise<boolean> {
    status(`Loading "${slug}"…`, true);
    try {
      const { exists, content } = await readPost(slug);
      if (!exists) {
        status("That post no longer exists on GitHub.", false);
        void refreshPostList();
        return false;
      }
      resetComposer();
      const { fields, body } = parsePost(content);
      titleEl.value = fields.title;
      dateEl.value = fields.date || todayISO();
      lastmodEl.value = fields.lastmod;
      tagsEl.value = fields.tags.join(", ");
      summaryEl.value = fields.summary;
      pdfEl.value = fields.pdf;
      draftEl.checked = fields.draft;
      extra = fields.extra;
      selectCover(fields.cover);
      bodyEl.value = body;
      renderPreviewSoon();
      enterEditMode(slug);
      status(`Loaded "${slug}".`, true);
      headingEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    } catch (err) {
      status(`Load error: ${err instanceof Error ? err.message : String(err)}`, false);
      return false;
    }
  }

  async function removePost(slug: string, btn: HTMLButtonElement): Promise<void> {
    if (!(await confirmDialog(`Delete the post "${slug}"? Its file is removed from GitHub.`))) return;
    btn.disabled = true;
    try {
      await deletePost(slug);
      if (editingSlug === slug) resetComposer();
      status(`Deleted "${slug}".`, true);
      void refreshPostList();
    } catch (err) {
      status(`Delete error: ${err instanceof Error ? err.message : String(err)}`, false);
      btn.disabled = false;
    }
  }

  async function refreshPostList(): Promise<void> {
    postListEl.innerHTML = `<tr><td colspan="3" class="empty">Loading…</td></tr>`;
    try {
      const { posts } = await listPosts();
      posts.sort((a, b) => (a.date < b.date ? 1 : -1));
      postListEl.innerHTML = posts.length
        ? posts.map((p) => `
          <tr>
            <td class="truncate"><a href="/posts/${esc(p.slug)}/" target="_blank" rel="noopener">${esc(p.title || p.slug)}</a></td>
            <td class="nowrap">${esc(p.date)}</td>
            <td class="nowrap">
              <button class="btn" data-edit="${esc(p.slug)}">Edit</button>
              <button class="btn" data-latex="${esc(p.slug)}">LaTeX</button>
              <button class="btn danger" data-del="${esc(p.slug)}">Delete</button>
            </td>
          </tr>`).join("")
        : `<tr><td colspan="3" class="empty">No posts yet.</td></tr>`;
      postListEl.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => void startEditing(btn.dataset.edit!));
      });
      postListEl.querySelectorAll<HTMLButtonElement>("[data-latex]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (await startEditing(btn.dataset.latex!)) await generateLatex();
        });
      });
      postListEl.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => void removePost(btn.dataset.del!, btn));
      });
    } catch (err) {
      postListEl.innerHTML = `<tr><td colspan="3" class="empty">Couldn't load posts: ${esc(err instanceof Error ? err.message : String(err))}</td></tr>`;
    }
  }

  // ── LaTeX ──────────────────────────────────────────────────────────────
  const latexOut = $<HTMLTextAreaElement>("be-latex-out");
  const latexInfo = $("be-latex-info");
  const latexCopyBtn = $<HTMLButtonElement>("be-latex-copy");
  const latexZipBtn = $<HTMLButtonElement>("be-latex-zip");
  const progressEl = $("be-latex-progress");
  const compileBtn = $<HTMLButtonElement>("be-latex-compile");
  let latexImages: { src: string; file: string }[] = [];
  let pollTimer: number | undefined;

  function resetLatex(): void {
    latexOut.value = "";
    latexOut.hidden = true;
    latexInfo.innerHTML = "";
    latexCopyBtn.disabled = true;
    latexZipBtn.disabled = true;
    latexImages = [];
  }

  async function generateLatex(): Promise<void> {
    const f = currentFields();
    const slug = currentSlug();
    if (!f.title || !bodyEl.value.trim() || !slug) {
      status("A title, slug and body are needed before generating LaTeX.", false);
      return;
    }
    const { blogToLatex } = await import("./latex");
    const result = blogToLatex(bodyEl.value, {
      slug,
      title: f.title,
      date: f.date,
      updated: f.lastmod.trim() || undefined,
      tags: f.tags,
      excerpt: f.summary.trim() || undefined,
    });
    latexOut.value = result.tex;
    latexOut.hidden = false;
    latexCopyBtn.disabled = false;
    latexZipBtn.disabled = false;
    latexImages = result.images;
    const imgs = result.images.length
      ? `<p>Images used (${result.images.length}):</p><ul>${result.images.map((i) => `<li><a href="/${esc(i.src)}" target="_blank" rel="noopener">${esc(i.file)}</a></li>`).join("")}</ul>`
      : "";
    const warnings = result.warnings.length
      ? `<p>Check before compiling:</p><ul class="err">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : "";
    latexInfo.innerHTML = imgs + warnings;
    const panel = $<HTMLDetailsElement>("be-latex");
    panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("be-latex-gen").addEventListener("click", () => void generateLatex());

  latexCopyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(latexOut.value);
      status("LaTeX copied.", true);
    } catch {
      latexOut.select();
      status("Clipboard unavailable. The text is selected; press Ctrl/Cmd+C.", false);
    }
  });

  latexZipBtn.addEventListener("click", async () => {
    latexZipBtn.disabled = true;
    try {
      const missing: string[] = [];
      const files = await Promise.all(latexImages.map(async (img) => {
        try {
          const res = await fetch(`/${img.src}`);
          if (!res.ok) throw new Error(String(res.status));
          return { name: img.file, bytes: new Uint8Array(await res.arrayBuffer()) };
        } catch {
          missing.push(img.file);
          return null;
        }
      }));
      const { downloadZip } = await import("./zip");
      downloadZip(
        [{ name: "main.tex", text: latexOut.value }, ...files.filter((f): f is { name: string; bytes: Uint8Array<ArrayBuffer> } => f !== null)],
        `${currentSlug() || "post"}-overleaf.zip`,
      );
      status(missing.length ? `Zip downloaded, but these images were missing: ${missing.join(", ")}` : "Zip downloaded. In Overleaf: New Project, Upload Project.", !missing.length);
    } finally {
      latexZipBtn.disabled = false;
    }
  });

  // Overleaf's documented POST form; images are fetched by URL.
  $("be-latex-overleaf").addEventListener("click", async () => {
    await generateLatex();
    if (!latexOut.value) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.overleaf.com/docs";
    form.target = "_blank";
    const add = (name: string, value: string) => form.appendChild(Object.assign(document.createElement("input"), { type: "hidden", name, value }));
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

  function showProgress(html: string): void {
    progressEl.hidden = false;
    progressEl.innerHTML = html;
  }

  /** Newest run of a workflow created after `since`, from the public Actions API. */
  async function latestRun(workflow: string, since: number): Promise<{ status: string; conclusion: string | null; html_url: string } | null> {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/runs?branch=Website&per_page=5`, {
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
        const run = await latestRun(stage === "compile" ? "latex-pdf.yml" : "deploy.yml", since);
        const link = run ? ` <a href="${esc(run.html_url)}" target="_blank" rel="noopener">Log</a>` : "";
        if (stage === "compile") {
          if (!run) showProgress(`Waiting for GitHub to start compiling… (${tries * 10}s)`);
          else if (run.status !== "completed") showProgress(`Compiling <b>${esc(slug)}</b>…${link}`);
          else if (run.conclusion === "success") {
            stage = "deploy";
            pdfEl.value = `gallery-media/${slug}.pdf`;
            showProgress(`PDF compiled and attached. Deploying the site…${link}`);
          } else {
            showProgress(`<span class="err">Compile failed (${esc(run.conclusion ?? "unknown")}).</span>${link} The LaTeX log is attached to the run.`);
            compileBtn.disabled = false;
            return;
          }
        } else if (run && run.status === "completed") {
          showProgress(run.conclusion === "success"
            ? `Done. <a href="/posts/${encodeURIComponent(slug)}/" target="_blank" rel="noopener">Open the post</a> · <a href="/gallery-media/${encodeURIComponent(slug)}.pdf" target="_blank" rel="noopener">Open the PDF</a>`
            : `<span class="err">PDF committed, but the deploy failed.</span>${link}`);
          compileBtn.disabled = false;
          return;
        }
      } catch {
        // Network hiccup or API rate limit; keep polling.
      }
      if (tries > 60) {
        showProgress(`Still running after 10 minutes. Check <a href="https://github.com/${REPO}/actions" target="_blank" rel="noopener">GitHub Actions</a>.`);
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
      status("Publish the post first, or open it with Edit. The PDF is attached to an existing post.", false);
      return;
    }
    await generateLatex();
    if (!latexOut.value) return;
    if (!(await confirmDialog(`Compile "${slug}" on GitHub and attach the PDF to the post?`, "Compile"))) return;
    compileBtn.disabled = true;
    try {
      const since = Date.now();
      await publishLatex(slug, latexOut.value);
      showProgress("LaTeX committed. Waiting for GitHub to start compiling…");
      watchCompile(slug, since);
    } catch (err) {
      status(`Compile error: ${err instanceof Error ? err.message : String(err)}`, false);
      compileBtn.disabled = false;
    }
  });

  void refreshPostList();
}
