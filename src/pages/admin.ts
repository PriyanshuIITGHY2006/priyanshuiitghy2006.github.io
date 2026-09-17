import "../styles/admin.css";
import { supabase, RESUME_PDF_BUCKET, RESUME_PDF_FILE, getResumePdfUrl, loadAllSiteImages, type DBSiteImage } from "../lib/supabase";
import { confirmDialog } from "../lib/confirm-dialog";
import { getPageViews } from "../lib/analytics";
import { uploadImageToGithub } from "../lib/admin-publish";
import { renderMarkdownHelp } from "../lib/markdown-help";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// ── Entry point ──────────────────────────────────────────────────────────────
// Real auth: a Supabase session (created via supabase.auth.signInWithPassword)
// is what actually gates writes, enforced by RLS policies on the server side.
// This client-side check only decides which screen to render — it grants
// nothing by itself.
export function mountAdmin(container: HTMLElement): void {
  container.innerHTML = `<article class="page section-page admin-login-page"><div class="section-body"><p class="admin-loading">Loading…</p></div></article>`;
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      renderPanel(container);
    } else {
      renderLogin(container);
    }
  });
}

// ── Login screen — same page/section chrome as every other page on the
// site, not a separate visual system. ──────────────────────────────────────
function renderLogin(container: HTMLElement, notice?: string): void {
  container.innerHTML = `
    <article class="page section-page admin-login-page">
      <nav class="section-nav">
        <a class="section-back" href="/">← back</a>
        <span class="section-crumb">Admin</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Sign in</h2>
        ${notice ? `<p class="edu-note">${esc(notice)}</p>` : ""}
        <form class="admin-login-form" id="admin-login-form">
          <div id="admin-login-err" class="admin-login-error" style="display:none"></div>
          <div>
            <label for="admin-email">Email</label>
            <input type="email" id="admin-email" placeholder="you@example.com" autocomplete="username" required/>
          </div>
          <div>
            <label for="admin-pw">Password</label>
            <input type="password" id="admin-pw" placeholder="Enter password" autocomplete="current-password" required/>
          </div>
          <div class="admin-login-actions">
            <button type="submit" class="pj-link admin-login-submit" id="admin-login-btn">Sign in</button>
          </div>
        </form>
      </div>
    </article>`;

  const form = container.querySelector<HTMLFormElement>("#admin-login-form")!;
  const email = container.querySelector<HTMLInputElement>("#admin-email")!;
  const pw = container.querySelector<HTMLInputElement>("#admin-pw")!;
  const btn = container.querySelector<HTMLButtonElement>("#admin-login-btn")!;
  const err = container.querySelector<HTMLElement>("#admin-login-err")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = "Signing in…";
    err.style.display = "none";
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: pw.value,
    });

    if (error) {
      btn.disabled = false;
      btn.textContent = "Sign in";
      err.textContent = "Incorrect email or password.";
      err.style.display = "block";
      pw.value = "";
      pw.focus();
      return;
    }
    renderPanel(container);
  });

  email.focus();
}

// ── Main panel ───────────────────────────────────────────────────────────────
type Tab = "projects" | "achievements" | "skills" | "positions" | "images" | "resume" | "comments" | "blog-editor" | "analytics";
const TABS: { id: Tab; label: string }[] = [
  { id: "projects", label: "Projects" },
  { id: "achievements", label: "Achievements" },
  { id: "skills", label: "Skills" },
  { id: "positions", label: "Positions" },
  { id: "images", label: "Images" },
  { id: "resume", label: "Resume" },
  { id: "comments", label: "Blog Comments" },
  { id: "blog-editor", label: "New Blog Post" },
  { id: "analytics", label: "Analytics" },
];

let currentTab: Tab = "projects";
let accountPanelOpen = false;

function renderPanel(container: HTMLElement): void {
  container.innerHTML = `
    <article class="page section-page admin-page">
      <nav class="section-nav">
        <a class="section-back" href="/">← back</a>
        <span class="section-crumb">Admin</span>
      </nav>
      <div class="section-body">
        <div class="admin-panel-header">
          <h2 class="section" style="border:none;margin:0;padding:0;">Portfolio Admin</h2>
          <div class="admin-panel-actions">
            <button class="admin-btn" id="admin-account-toggle">Account</button>
            <button class="admin-btn admin-btn-danger" id="admin-logout">Log out</button>
          </div>
        </div>
        <div id="admin-account-panel"></div>
        <div class="admin-tabbar">
          ${TABS.map((t) => `<button class="admin-tab-btn ${currentTab === t.id ? "active" : ""}" data-tab="${t.id}">${esc(t.label)}</button>`).join("")}
        </div>
        <div id="admin-content"><p class="admin-loading">Loading…</p></div>
      </div>
    </article>`;

  container.querySelector("#admin-logout")!.addEventListener("click", async () => {
    if (!(await confirmDialog("Log out of the admin panel?", "Log out"))) return;
    await supabase.auth.signOut();
    renderLogin(container);
  });

  const accountToggle = container.querySelector<HTMLButtonElement>("#admin-account-toggle")!;
  accountToggle.addEventListener("click", () => {
    accountPanelOpen = !accountPanelOpen;
    renderAccountPanel(container);
  });
  renderAccountPanel(container);

  container.querySelectorAll<HTMLButtonElement>(".admin-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab as Tab;
      container.querySelectorAll(".admin-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadTab(container);
    });
  });

  loadTab(container);
}

// ── Account panel: change password ──────────────────────────────────────────
function renderAccountPanel(container: HTMLElement): void {
  const slot = container.querySelector<HTMLElement>("#admin-account-panel")!;
  if (!accountPanelOpen) {
    slot.innerHTML = "";
    return;
  }
  slot.innerHTML = `
    <div class="admin-account-panel">
      <h3>Change password</h3>
      <div id="admin-pw-status" class="admin-status" style="display:none"></div>
      <div class="admin-form">
        <div>
          <label for="admin-new-pw">New password</label>
          <input type="password" id="admin-new-pw" autocomplete="new-password" placeholder="At least 8 characters"/>
        </div>
        <div>
          <label for="admin-new-pw2">Confirm new password</label>
          <input type="password" id="admin-new-pw2" autocomplete="new-password"/>
        </div>
        <div class="admin-form-actions">
          <button type="button" class="admin-btn admin-btn-primary" id="admin-pw-save">Update password</button>
        </div>
      </div>
    </div>`;

  const pw1 = slot.querySelector<HTMLInputElement>("#admin-new-pw")!;
  const pw2 = slot.querySelector<HTMLInputElement>("#admin-new-pw2")!;
  const saveBtn = slot.querySelector<HTMLButtonElement>("#admin-pw-save")!;
  const statusEl = slot.querySelector<HTMLElement>("#admin-pw-status")!;

  saveBtn.addEventListener("click", async () => {
    if (pw1.value.length < 8) { setStatus(statusEl, "Password must be at least 8 characters.", false); return; }
    if (pw1.value !== pw2.value) { setStatus(statusEl, "Passwords don't match.", false); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = "Updating…";
    const { error } = await supabase.auth.updateUser({ password: pw1.value });
    saveBtn.disabled = false;
    saveBtn.textContent = "Update password";
    if (error) { setStatus(statusEl, "Error: " + error.message, false); return; }
    pw1.value = "";
    pw2.value = "";
    setStatus(statusEl, "Password updated.", true);
  });
}

function loadTab(container: HTMLElement): void {
  const content = container.querySelector<HTMLElement>("#admin-content")!;
  content.innerHTML = `<p class="admin-loading">Loading…</p>`;
  switch (currentTab) {
    case "projects":     void renderProjects(content);     break;
    case "achievements": void renderAchievements(content); break;
    case "skills":       void renderSkills(content);       break;
    case "positions":    void renderPositions(content);    break;
    case "images":       void renderImages(content);       break;
    case "resume":       void renderResumeTab(content);    break;
    case "comments":     void renderComments(content);     break;
    case "blog-editor":
      void import("./admin-blog-editor").then(({ renderBlogEditor }) => renderBlogEditor(content));
      break;
    case "analytics":    void renderAnalytics(content);      break;
  }
}

// ── Status helper ────────────────────────────────────────────────────────────
function setStatus(el: HTMLElement | null, msg: string, ok: boolean): void {
  if (!el) return;
  el.textContent = msg;
  el.className = `admin-status ${ok ? "admin-status-ok" : "admin-status-err"}`;
  el.style.display = "block";
  if (ok) setTimeout(() => { el.style.display = "none"; }, 3000);
}

function emptyRow(colspan: number, label: string): string {
  return `<tr><td colspan="${colspan}" class="admin-table-empty">${esc(label)}</td></tr>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// PROJECTS TAB — one row backs both the résumé's project line (title/date/
// stack/bullets) and the standalone /projects + /project?id= pages
// (tagline/detail/highlights/verify/extra links + a GitHub-published
// write-up). show_in_cv toggles whether a project also appears on the résumé.
// ══════════════════════════════════════════════════════════════════════════════
async function renderProjects(el: HTMLElement): Promise<void> {
  const [{ data: projects }, { data: bullets }, { data: links }, images] = await Promise.all([
    supabase.from("projects").select("*").order("sort_order"),
    supabase.from("project_bullets").select("*").order("sort_order"),
    supabase.from("project_links").select("*").order("sort_order"),
    loadAllSiteImages(),
  ]);
  const verifyOptions = images.filter((i) => i.kind === "gallery");

  const bulletsByProject = new Map<string, { id: number; bullet: string }[]>();
  for (const b of bullets ?? []) {
    const list = bulletsByProject.get(b.project_id) ?? [];
    list.push({ id: b.id, bullet: b.bullet });
    bulletsByProject.set(b.project_id, list);
  }
  const linksByProject = new Map<string, { id: number; label: string; href: string }[]>();
  for (const l of links ?? []) {
    const list = linksByProject.get(l.project_id) ?? [];
    list.push({ id: l.id, label: l.label, href: l.href });
    linksByProject.set(l.project_id, list);
  }

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Add project</h3>
      <div id="proj-add-status" class="admin-status" style="display:none"></div>
      ${projectForm("add", undefined, [], [], verifyOptions)}
    </div>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Title</th><th>Date</th><th>Stack</th><th>In CV</th><th>Write-up</th><th>Actions</th></tr></thead>
      <tbody>
        ${(projects ?? []).length ? (projects ?? []).map((p) => `
          <tr id="proj-row-${esc(p.id)}">
            <td class="truncate">${esc(p.title)}</td>
            <td style="white-space:nowrap">${esc(p.date)}</td>
            <td class="truncate">${esc(p.stack)}</td>
            <td>${p.show_in_cv ? "✓" : "—"}</td>
            <td>${p.id in PROJECT_WRITEUP_EXISTS ? "✓" : "—"}</td>
            <td>
              <button class="admin-btn" data-proj-edit="${esc(p.id)}">Edit</button>
              <button class="admin-btn admin-btn-danger" data-proj-del="${esc(p.id)}">Delete</button>
            </td>
          </tr>
          <tr id="proj-edit-${esc(p.id)}" style="display:none">
            <td colspan="6">
              <div id="proj-edit-status-${esc(p.id)}" class="admin-status" style="display:none"></div>
              ${projectForm("edit", p, bulletsByProject.get(p.id) ?? [], linksByProject.get(p.id) ?? [], verifyOptions)}
              ${writeupEditorHtml(p.id)}
            </td>
          </tr>`).join("") : emptyRow(6, "No projects yet — add one above.")}
      </tbody>
    </table>
    </div>`;

  // Add form submit
  el.querySelector<HTMLButtonElement>("#proj-add-submit")!.addEventListener("click", async (e) => {
    await saveProject(el, "add", null, e.currentTarget as HTMLButtonElement);
  });

  // Edit / delete buttons
  el.querySelectorAll<HTMLButtonElement>("[data-proj-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.projEdit!;
      const row = el.querySelector<HTMLElement>(`#proj-edit-${id}`)!;
      row.style.display = row.style.display === "none" ? "table-row" : "none";
    });
  });

  el.querySelectorAll<HTMLButtonElement>("[data-proj-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.projDel!;
      if (!(await confirmDialog(`Delete project "${id}" and all its bullets/links? This can't be undone (the GitHub write-up file, if any, is left in place).`))) return;
      btn.disabled = true;
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) { alert("Error: " + error.message); btn.disabled = false; return; }
      void renderProjects(el);
    });
  });

  // Edit form submits
  el.querySelectorAll<HTMLButtonElement>("[data-proj-save]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.projSave!;
      const proj = (projects ?? []).find((p) => p.id === id)!;
      await saveProject(el, "edit", proj, e.currentTarget as HTMLButtonElement);
    });
  });

  // Write-up editors (one per existing project)
  (projects ?? []).forEach((p) => wireWriteupEditor(el, p.id));
}

// Set of project ids known to already have a published write-up on GitHub —
// there's no "does this file exist" check available client-side, so this
// only ever reflects write-ups published earlier *in this session* (best
// effort; the ✓/— column just starts blank on a fresh page load).
const PROJECT_WRITEUP_EXISTS: Record<string, true> = {};

function projectForm(
  mode: "add" | "edit",
  p?: Record<string, string | number | boolean | null>,
  existingBullets?: { id: number; bullet: string }[],
  existingLinks?: { id: number; label: string; href: string }[],
  images: DBSiteImage[] = [],
): string {
  const v = (f: string) => esc(String(p?.[f] ?? ""));
  const id = mode === "edit" ? `data-proj-save="${v("id")}"` : `id="proj-add-submit"`;
  const bullets = existingBullets ?? [];
  const bulletRows = bullets
    .map((b) => `
      <div class="admin-bullet-row" data-bullet-idx="${b.id}">
        <textarea name="bullet">${esc(b.bullet)}</textarea>
        <button type="button" class="admin-btn admin-btn-danger admin-rm-bullet">✕</button>
      </div>`)
    .join("");
  const linkRows = (existingLinks ?? [])
    .map((l) => `
      <div class="admin-link-row" data-link-idx="${l.id}">
        <input type="text" name="link-label" value="${esc(l.label)}" placeholder="Live demo"/>
        <input type="text" name="link-href" value="${esc(l.href)}" placeholder="https://..."/>
        <button type="button" class="admin-btn admin-btn-danger admin-rm-link">✕</button>
      </div>`)
    .join("");
  const prefix = mode === "edit" ? `edit-${v("id")}` : "add";
  const showInCv = mode === "add" ? true : p?.show_in_cv !== false;
  const currentVerify = String(p?.verify ?? "");
  const verifyOptions = images
    .map((img) => `<option value="${esc(img.id)}" ${img.id === currentVerify ? "selected" : ""}>${esc(img.title)}</option>`)
    .join("");
  // detail/highlights are stored newline-delimited (one paragraph / one
  // highlight per line) — a plain multi-line textarea matches that 1:1.
  const detailLines = String(p?.detail_html ?? "").split("\n").filter(Boolean).join("\n");
  const highlightLines = String(p?.highlights_text ?? "").split("\n").filter(Boolean).join("\n");
  return `
    <div class="admin-form" data-proj-form="${prefix}">
      <div class="admin-form-row">
        <div><label>ID (slug)</label><input type="text" name="id" value="${v("id")}" ${mode === "edit" ? "readonly" : ""} placeholder="my-project"/></div>
        <div><label>Date</label><input type="text" name="date" value="${v("date")}" placeholder="Jan 2026 – Present"/></div>
      </div>
      <div><label>Title</label><input type="text" name="title" value="${v("title")}" placeholder="Project Title"/></div>
      <div><label>Stack (comma-separated)</label><input type="text" name="stack" value="${v("stack")}" placeholder="Python, PyTorch"/></div>
      <div><label>Excerpt / tagline — one line, shown on the résumé and the Projects page</label><input type="text" name="tagline" value="${v("tagline")}" placeholder="What this project is, in one sentence"/></div>
      <label class="admin-checkbox-row"><input type="checkbox" name="show_in_cv" ${showInCv ? "checked" : ""}/> Show in résumé (CV)</label>
      <div><label>Detail paragraphs — one per line, shown on the Projects page (HTML allowed)</label><textarea name="detail" style="min-height:90px">${esc(detailLines)}</textarea></div>
      <div><label>Highlights — one per line</label><textarea name="highlights" style="min-height:64px">${esc(highlightLines)}</textarea></div>
      <div><label>Verify image (from the Images tab)</label>
        <select name="verify"><option value="">— none —</option>${verifyOptions}</select>
      </div>
      <div class="admin-form-row">
        <div><label>Link Text</label><input type="text" name="link_text" value="${v("link_text")}" placeholder="Github"/></div>
        <div><label>Link URL</label><input type="text" name="link_href" value="${v("link_href")}" placeholder="https://..."/></div>
      </div>
      <div><label>Link Detail ID</label><input type="text" name="link_detail" value="${v("link_detail")}" placeholder="my-project"/></div>
      <div>
        <label>Extra links (beyond the one above)</label>
        <div class="admin-link-list" id="link-list-${prefix}">${linkRows}</div>
        <button type="button" class="admin-btn admin-add-link">+ Add link</button>
      </div>
      <div>
        <label>Bullets (résumé only)</label>
        <div class="admin-bullet-list" id="bullet-list-${prefix}">${bulletRows}</div>
        <button type="button" class="admin-btn admin-add-bullet">+ Add bullet</button>
      </div>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn admin-btn-primary" ${id}>${mode === "add" ? "Add project" : "Save changes"}</button>
      </div>
    </div>`;
}

async function saveProject(
  el: HTMLElement,
  mode: "add" | "edit",
  existing: Record<string, string | number | boolean | null> | null,
  triggerBtn: HTMLButtonElement,
): Promise<void> {
  const prefix = mode === "edit" ? `edit-${existing!.id}` : "add";
  const form = el.querySelector<HTMLElement>(`[data-proj-form="${prefix}"]`)!;
  const statusId = mode === "edit" ? `proj-edit-status-${existing!.id}` : "proj-add-status";
  const statusEl = el.querySelector<HTMLElement>(`#${statusId}`);

  const g = (name: string) =>
    (form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "").trim();
  const id = g("id");
  if (!id || !g("title") || !g("stack")) {
    setStatus(statusEl, "ID, Title and Stack are required.", false);
    return;
  }
  const showInCv = form.querySelector<HTMLInputElement>('[name="show_in_cv"]')!.checked;

  const row = {
    id,
    title: g("title"),
    date: g("date"),
    stack: g("stack"),
    link_text: g("link_text") || null,
    link_href: g("link_href") || null,
    link_detail: g("link_detail") || null,
    show_in_cv: showInCv,
    tagline: g("tagline") || null,
    detail_html: g("detail") || null,
    highlights_text: g("highlights") || null,
    verify: g("verify") || null,
  };

  triggerBtn.disabled = true;
  const originalLabel = triggerBtn.textContent;
  triggerBtn.textContent = "Saving…";

  const { error: upsertErr } = await supabase.from("projects").upsert(row);
  if (upsertErr) {
    setStatus(statusEl, "Error: " + upsertErr.message, false);
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalLabel;
    return;
  }

  // Bullets: delete existing then re-insert
  await supabase.from("project_bullets").delete().eq("project_id", id);
  const bulletEls = form.querySelectorAll<HTMLTextAreaElement>(".admin-bullet-row textarea");
  const newBullets = Array.from(bulletEls).map((t, i) => ({ project_id: id, bullet: t.value.trim(), sort_order: i + 1 })).filter((b) => b.bullet);
  if (newBullets.length > 0) {
    const { error: bErr } = await supabase.from("project_bullets").insert(newBullets);
    if (bErr) {
      setStatus(statusEl, "Bullets error: " + bErr.message, false);
      triggerBtn.disabled = false;
      triggerBtn.textContent = originalLabel;
      return;
    }
  }

  // Extra links: delete existing then re-insert
  await supabase.from("project_links").delete().eq("project_id", id);
  const linkRowEls = form.querySelectorAll<HTMLElement>(".admin-link-row");
  const newLinks = Array.from(linkRowEls)
    .map((row, i) => ({
      project_id: id,
      label: row.querySelector<HTMLInputElement>('[name="link-label"]')!.value.trim(),
      href: row.querySelector<HTMLInputElement>('[name="link-href"]')!.value.trim(),
      sort_order: i + 1,
    }))
    .filter((l) => l.label && l.href);
  if (newLinks.length > 0) {
    const { error: lErr } = await supabase.from("project_links").insert(newLinks);
    if (lErr) {
      setStatus(statusEl, "Links error: " + lErr.message, false);
      triggerBtn.disabled = false;
      triggerBtn.textContent = originalLabel;
      return;
    }
  }

  setStatus(statusEl, mode === "add" ? "Project added!" : "Saved!", true);
  void renderProjects(el);
}

// Bullet/link add/remove (event delegation, set once on the el)
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("admin-add-bullet")) {
    const list = target.previousElementSibling as HTMLElement;
    if (!list) return;
    const div = document.createElement("div");
    div.className = "admin-bullet-row";
    div.innerHTML = `<textarea name="bullet" style="flex:1;min-height:48px"></textarea><button type="button" class="admin-btn admin-btn-danger admin-rm-bullet">✕</button>`;
    list.appendChild(div);
  }
  if (target.classList.contains("admin-rm-bullet")) {
    target.closest(".admin-bullet-row")?.remove();
  }
  if (target.classList.contains("admin-add-link")) {
    const list = target.previousElementSibling as HTMLElement;
    if (!list) return;
    const div = document.createElement("div");
    div.className = "admin-link-row";
    div.innerHTML = `<input type="text" name="link-label" placeholder="Live demo"/><input type="text" name="link-href" placeholder="https://..."/><button type="button" class="admin-btn admin-btn-danger admin-rm-link">✕</button>`;
    list.appendChild(div);
  }
  if (target.classList.contains("admin-rm-link")) {
    target.closest(".admin-link-row")?.remove();
  }
});

// ── Write-up sub-editor: composes + publishes src/data/project-writeups/<id>.md ──
function writeupEditorHtml(projectId: string): string {
  const safeId = esc(projectId);
  return `
    <div class="admin-form-section" style="margin-top:0.8rem;">
      <h3>Write-up</h3>
      <p class="edu-note" style="margin-top:0;">
        Publishing replaces the current write-up (if any) and commits straight to GitHub — live once the next deploy finishes (~1–2 min). No frontmatter here, just the markdown body.
      </p>
      ${renderMarkdownHelp("project")}
      <div class="admin-editor-split" style="margin-top:0.6rem;">
        <div class="admin-editor-pane">
          <label class="admin-editor-pane-label">Markdown</label>
          <textarea id="writeup-body-${safeId}" class="admin-editor-textarea" placeholder="## How it works&#10;&#10;Write the deep-dive here."></textarea>
        </div>
        <div class="admin-editor-pane">
          <label class="admin-editor-pane-label">Live preview</label>
          <div class="admin-editor-preview">
            <div class="blog-content" id="writeup-preview-${safeId}"></div>
          </div>
        </div>
      </div>
      <div class="admin-form-actions" style="margin-top:0.6rem;">
        <button type="button" class="admin-btn admin-btn-primary" id="writeup-publish-${safeId}">Publish write-up to GitHub</button>
      </div>
      <div id="writeup-status-${safeId}" class="admin-status" style="display:none;margin-top:0.6rem;"></div>
    </div>`;
}

function wireWriteupEditor(el: HTMLElement, projectId: string): void {
  const bodyEl = el.querySelector<HTMLTextAreaElement>(`#writeup-body-${CSS.escape(projectId)}`);
  const previewEl = el.querySelector<HTMLElement>(`#writeup-preview-${CSS.escape(projectId)}`);
  const publishBtn = el.querySelector<HTMLButtonElement>(`#writeup-publish-${CSS.escape(projectId)}`);
  const statusEl = el.querySelector<HTMLElement>(`#writeup-status-${CSS.escape(projectId)}`);
  if (!bodyEl || !previewEl || !publishBtn || !statusEl) return;

  let debounceId: number | undefined;
  bodyEl.addEventListener("input", () => {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(async () => {
      const md = bodyEl.value.trim();
      if (!md) {
        previewEl.innerHTML = `<p class="admin-empty-note">Start typing to see a live preview.</p>`;
        return;
      }
      try {
        const { renderMarkdown } = await import("../lib/blog");
        previewEl.innerHTML = renderMarkdown(md);
      } catch (err) {
        previewEl.innerHTML = `<p class="blog-testcases-error">Preview error: ${esc(err instanceof Error ? err.message : String(err))}</p>`;
      }
    }, 150);
  });

  publishBtn.addEventListener("click", async () => {
    const content = bodyEl.value.trim();
    if (!content) {
      setStatus(statusEl, "Write something first.", false);
      return;
    }
    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      const { publishProjectWriteupToGithub } = await import("../lib/admin-publish");
      await publishProjectWriteupToGithub(projectId, content);
      PROJECT_WRITEUP_EXISTS[projectId] = true;
      setStatus(statusEl, `Published! Will be live once the site finishes redeploying (~1–2 min).`, true);
    } catch (err) {
      setStatus(statusEl, "Publish error: " + (err instanceof Error ? err.message : String(err)), false);
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = "Publish write-up to GitHub";
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS TAB — one row backs both the one-page résumé line (html/date)
// and the standalone /achievements page (title/tags/blurb/verify/link).
// ══════════════════════════════════════════════════════════════════════════════
async function renderAchievements(el: HTMLElement): Promise<void> {
  const [{ data: rows }, images] = await Promise.all([
    supabase.from("achievements").select("*").order("sort_order"),
    loadAllSiteImages(),
  ]);
  const verifyOptions = images.filter((i) => i.kind === "gallery");

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Add achievement</h3>
      <div id="ach-add-status" class="admin-status" style="display:none"></div>
      ${achievementForm("add", undefined, verifyOptions)}
    </div>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Title</th><th>Date</th><th>Verify</th><th>Actions</th></tr></thead>
      <tbody>
        ${(rows ?? []).length ? (rows ?? []).map((a) => `
          <tr id="ach-row-${esc(a.id)}">
            <td>${esc(a.id)}</td>
            <td class="truncate">${esc(a.title || a.html)}</td>
            <td style="white-space:nowrap">${esc(a.date)}</td>
            <td>${a.verify ? "✓" : "—"}</td>
            <td>
              <button class="admin-btn" data-ach-edit="${esc(a.id)}">Edit</button>
              <button class="admin-btn admin-btn-danger" data-ach-del="${esc(a.id)}">Delete</button>
            </td>
          </tr>
          <tr id="ach-edit-${esc(a.id)}" style="display:none">
            <td colspan="5">
              <div id="ach-edit-status-${esc(a.id)}" class="admin-status" style="display:none"></div>
              ${achievementForm("edit", a, verifyOptions)}
            </td>
          </tr>`).join("") : emptyRow(5, "No achievements yet — add one above.")}
      </tbody>
    </table>
    </div>`;

  el.querySelector<HTMLButtonElement>("#ach-add-submit")!.addEventListener("click", async (e) => {
    await saveAchievement(el, "add", null, rows ?? [], e.currentTarget as HTMLButtonElement);
  });

  el.querySelectorAll<HTMLButtonElement>("[data-ach-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.achEdit!;
      const row = el.querySelector<HTMLElement>(`#ach-edit-${id}`)!;
      row.style.display = row.style.display === "none" ? "table-row" : "none";
    });
  });

  el.querySelectorAll<HTMLButtonElement>("[data-ach-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.achDel!;
      if (!(await confirmDialog(`Delete achievement "${id}"?`))) return;
      btn.disabled = true;
      const { error } = await supabase.from("achievements").delete().eq("id", id);
      if (error) { alert("Error: " + error.message); btn.disabled = false; return; }
      void renderAchievements(el);
    });
  });

  el.querySelectorAll<HTMLButtonElement>("[data-ach-save]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.achSave!;
      const a = (rows ?? []).find((r) => r.id === id)!;
      await saveAchievement(el, "edit", a, rows ?? [], e.currentTarget as HTMLButtonElement);
    });
  });
}

function achievementForm(
  mode: "add" | "edit",
  a: Record<string, string | number | null> | undefined,
  images: DBSiteImage[],
): string {
  const v = (f: string) => esc(String(a?.[f] ?? ""));
  const idAttr = mode === "edit" ? `data-ach-save="${v("id")}"` : `id="ach-add-submit"`;
  const prefix = mode === "edit" ? `edit-${v("id")}` : "add";
  const currentVerify = String(a?.verify ?? "");
  const verifyOptions = images
    .map((img) => `<option value="${esc(img.id)}" ${img.id === currentVerify ? "selected" : ""}>${esc(img.title)}</option>`)
    .join("");
  return `
    <div class="admin-form" data-ach-form="${prefix}">
      <div class="admin-form-row">
        <div><label>ID (slug)</label><input type="text" name="id" value="${v("id")}" ${mode === "edit" ? "readonly" : ""} placeholder="my-award"/></div>
        <div><label>Date</label><input type="text" name="date" value="${v("date")}" placeholder="2026"/></div>
      </div>
      <div><label>Résumé line (HTML) — the one-page résumé's Achievements section</label><textarea name="html" style="min-height:60px">${v("html")}</textarea></div>
      <div><label>Title — the standalone Achievements page</label><input type="text" name="title" value="${v("title")}" placeholder="Award Title"/></div>
      <div><label>Tags (comma-separated)</label><input type="text" name="tags" value="${v("tags")}" placeholder="Gold Medal, AI Challenge"/></div>
      <div><label>Blurb (HTML allowed)</label><textarea name="blurb" style="min-height:80px">${v("blurb")}</textarea></div>
      <div><label>Verify image (from the Images tab)</label>
        <select name="verify"><option value="">— none —</option>${verifyOptions}</select>
      </div>
      <div class="admin-form-row">
        <div><label>Link label</label><input type="text" name="link_label" value="${v("link_label")}" placeholder="Program site"/></div>
        <div><label>Link URL</label><input type="text" name="link_href" value="${v("link_href")}" placeholder="https://..."/></div>
      </div>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn admin-btn-primary" ${idAttr}>${mode === "add" ? "Add achievement" : "Save changes"}</button>
      </div>
    </div>`;
}

async function saveAchievement(
  el: HTMLElement,
  mode: "add" | "edit",
  existing: Record<string, string | number | null> | null,
  rows: Record<string, string | number | null>[],
  triggerBtn: HTMLButtonElement,
): Promise<void> {
  const prefix = mode === "edit" ? `edit-${existing!.id}` : "add";
  const form = el.querySelector<HTMLElement>(`[data-ach-form="${prefix}"]`)!;
  const statusId = mode === "edit" ? `ach-edit-status-${existing!.id}` : "ach-add-status";
  const statusEl = el.querySelector<HTMLElement>(`#${statusId}`);

  const g = (name: string) =>
    (form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "").trim();
  const id = g("id");
  const html = g("html");
  if (!id || !html) {
    setStatus(statusEl, "ID and the résumé line are required.", false);
    return;
  }

  const row = {
    id,
    html,
    date: g("date"),
    title: g("title") || null,
    tags: g("tags") || null,
    blurb: g("blurb") || null,
    verify: g("verify") || null,
    link_label: g("link_label") || null,
    link_href: g("link_href") || null,
    sort_order: mode === "edit" ? Number(existing!.sort_order) : Math.max(0, ...rows.map((r) => Number(r.sort_order))) + 1,
  };

  triggerBtn.disabled = true;
  const originalLabel = triggerBtn.textContent;
  triggerBtn.textContent = "Saving…";

  const { error } = await supabase.from("achievements").upsert(row);
  triggerBtn.disabled = false;
  triggerBtn.textContent = originalLabel;
  if (error) {
    setStatus(statusEl, "Error: " + error.message, false);
    return;
  }
  setStatus(statusEl, mode === "add" ? "Achievement added!" : "Saved!", true);
  void renderAchievements(el);
}

// ══════════════════════════════════════════════════════════════════════════════
// SKILLS TAB
// ══════════════════════════════════════════════════════════════════════════════
async function renderSkills(el: HTMLElement): Promise<void> {
  const { data: rows } = await supabase.from("skills").select("*").order("sort_order");

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Add skill line</h3>
      <div id="skill-add-status" class="admin-status" style="display:none"></div>
      <div class="admin-form">
        <div><label>Label</label><input type="text" id="skill-label" placeholder="Programming"/></div>
        <div><label>Items (HTML allowed)</label><textarea id="skill-items" placeholder="C++, Python, C"></textarea></div>
        <div class="admin-form-actions">
          <button class="admin-btn admin-btn-primary" id="skill-add-btn">Add skill line</button>
        </div>
      </div>
    </div>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Label</th><th>Items</th><th>Actions</th></tr></thead>
      <tbody>
        ${(rows ?? []).length ? (rows ?? []).map((s) => `
          <tr>
            <td>${esc(s.label)}</td>
            <td class="truncate">${esc(s.items)}</td>
            <td><button class="admin-btn admin-btn-danger" data-skill-del="${s.id}">Delete</button></td>
          </tr>`).join("") : emptyRow(3, "No skill lines yet — add one above.")}
      </tbody>
    </table>
    </div>`;

  const addBtn = el.querySelector<HTMLButtonElement>("#skill-add-btn")!;
  addBtn.addEventListener("click", async () => {
    const label = (el.querySelector<HTMLInputElement>("#skill-label")!.value).trim();
    const items = (el.querySelector<HTMLTextAreaElement>("#skill-items")!.value).trim();
    const statusEl = el.querySelector<HTMLElement>("#skill-add-status");
    if (!label || !items) { setStatus(statusEl, "Label and Items are required.", false); return; }
    addBtn.disabled = true;
    const maxOrder = Math.max(0, ...(rows ?? []).map((r) => r.sort_order));
    const { error } = await supabase.from("skills").insert({ label, items, sort_order: maxOrder + 1 });
    if (error) { setStatus(statusEl, "Error: " + error.message, false); addBtn.disabled = false; return; }
    setStatus(statusEl, "Added!", true);
    void renderSkills(el);
  });

  el.querySelectorAll<HTMLButtonElement>("[data-skill-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this skill line?"))) return;
      btn.disabled = true;
      const { error } = await supabase.from("skills").delete().eq("id", Number(btn.dataset.skillDel));
      if (error) { alert("Error: " + error.message); btn.disabled = false; return; }
      void renderSkills(el);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// POSITIONS TAB
// ══════════════════════════════════════════════════════════════════════════════
async function renderPositions(el: HTMLElement): Promise<void> {
  const { data: rows } = await supabase.from("positions").select("*").order("sort_order");

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Add position</h3>
      <div id="pos-add-status" class="admin-status" style="display:none"></div>
      <div class="admin-form">
        <div><label>HTML content</label><textarea id="pos-html" placeholder="&lt;b&gt;Role,&lt;/b&gt; Organisation"></textarea></div>
        <div><label>Date</label><input type="text" id="pos-date" placeholder="Jan. 2026 - Present"/></div>
        <div class="admin-form-actions">
          <button class="admin-btn admin-btn-primary" id="pos-add-btn">Add position</button>
        </div>
      </div>
    </div>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>HTML</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>
        ${(rows ?? []).length ? (rows ?? []).map((p) => `
          <tr>
            <td class="truncate">${esc(p.html)}</td>
            <td style="white-space:nowrap">${esc(p.date)}</td>
            <td><button class="admin-btn admin-btn-danger" data-pos-del="${p.id}">Delete</button></td>
          </tr>`).join("") : emptyRow(3, "No positions yet — add one above.")}
      </tbody>
    </table>
    </div>`;

  const addBtn = el.querySelector<HTMLButtonElement>("#pos-add-btn")!;
  addBtn.addEventListener("click", async () => {
    const html = (el.querySelector<HTMLTextAreaElement>("#pos-html")!.value).trim();
    const date = (el.querySelector<HTMLInputElement>("#pos-date")!.value).trim();
    const statusEl = el.querySelector<HTMLElement>("#pos-add-status");
    if (!html) { setStatus(statusEl, "HTML content is required.", false); return; }
    addBtn.disabled = true;
    const maxOrder = Math.max(0, ...(rows ?? []).map((r) => r.sort_order));
    const { error } = await supabase.from("positions").insert({ html, date, sort_order: maxOrder + 1 });
    if (error) { setStatus(statusEl, "Error: " + error.message, false); addBtn.disabled = false; return; }
    setStatus(statusEl, "Added!", true);
    void renderPositions(el);
  });

  el.querySelectorAll<HTMLButtonElement>("[data-pos-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this position?"))) return;
      btn.disabled = true;
      const { error } = await supabase.from("positions").delete().eq("id", Number(btn.dataset.posDel));
      if (error) { alert("Error: " + error.message); btn.disabled = false; return; }
      void renderPositions(el);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGES TAB — uploads commit straight to GitHub (public/gallery/), with
// metadata tracked in site_images. Feeds both the Gallery page and the
// achievement "verify" / blog cover dropdowns elsewhere in this panel.
// ══════════════════════════════════════════════════════════════════════════════
function slugifyFilename(name: string): string {
  const base = name.replace(/\.[^./]+$/, "");
  const slug = base.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  return slug || `image-${Date.now()}`;
}

async function renderImages(el: HTMLElement): Promise<void> {
  const images = await loadAllSiteImages();

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Upload image</h3>
      <p class="edu-note" style="margin-top:0;">
        Commits the file straight to GitHub (<code>public/gallery/</code>) — it shows up on the live site once the next deploy finishes, usually 1–2 minutes.
      </p>
      <div id="img-add-status" class="admin-status" style="display:none"></div>
      <div class="admin-form">
        <div><label>File (image or PDF)</label><input type="file" id="img-file-input" accept="image/*,application/pdf"/></div>
        <div class="admin-form-row">
          <div><label>ID (slug)</label><input type="text" id="img-id" placeholder="auto-generated-from-filename"/></div>
          <div><label>Date</label><input type="text" id="img-date" placeholder="2026"/></div>
        </div>
        <div><label>Title</label><input type="text" id="img-title" placeholder="Certificate / image title"/></div>
        <div><label>Description</label><input type="text" id="img-desc" placeholder="Shown in the gallery lightbox"/></div>
        <div><label>Shows up in</label>
          <select id="img-kind">
            <option value="gallery">Gallery page + achievement "Verify" links</option>
            <option value="blog-cover">Blog cover picker only</option>
          </select>
        </div>
        <div class="admin-form-actions">
          <button class="admin-btn admin-btn-primary" id="img-upload-btn" disabled>Upload</button>
        </div>
      </div>
    </div>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Preview</th><th>Title</th><th>Kind</th><th>Actions</th></tr></thead>
      <tbody>
        ${images.length ? images.map((img) => `
          <tr>
            <td>${/\.pdf$/i.test(img.src)
              ? `<span class="admin-btn" style="pointer-events:none;">PDF</span>`
              : `<img src="${esc(img.src)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:4px;display:block"/>`}</td>
            <td class="truncate">${esc(img.title)}</td>
            <td>${esc(img.kind)}</td>
            <td><button class="admin-btn admin-btn-danger" data-img-del="${esc(img.id)}">Remove</button></td>
          </tr>`).join("") : emptyRow(4, "No images uploaded yet.")}
      </tbody>
    </table>
    </div>`;

  const fileInput = el.querySelector<HTMLInputElement>("#img-file-input")!;
  const idInput = el.querySelector<HTMLInputElement>("#img-id")!;
  const titleInput = el.querySelector<HTMLInputElement>("#img-title")!;
  const uploadBtn = el.querySelector<HTMLButtonElement>("#img-upload-btn")!;
  const statusEl = el.querySelector<HTMLElement>("#img-add-status");

  let idTouched = false;
  idInput.addEventListener("input", () => { idTouched = true; });
  fileInput.addEventListener("change", () => {
    uploadBtn.disabled = !fileInput.files?.length;
    const f = fileInput.files?.[0];
    if (f && !idTouched) idInput.value = slugifyFilename(f.name);
    if (f && !titleInput.value) titleInput.value = f.name.replace(/\.[^./]+$/, "");
  });

  uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const id = idInput.value.trim() || slugifyFilename(file.name);
    const title = titleInput.value.trim() || file.name;
    const date = (el.querySelector<HTMLInputElement>("#img-date")!.value).trim();
    const description = (el.querySelector<HTMLInputElement>("#img-desc")!.value).trim();
    const kind = el.querySelector<HTMLSelectElement>("#img-kind")!.value as "gallery" | "blog-cover";

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading to GitHub…";
    try {
      const { src } = await uploadImageToGithub(file);
      const maxOrder = Math.max(0, ...images.map((i) => i.sort_order));
      const { error } = await supabase.from("site_images").upsert({
        id,
        title,
        src,
        date: date || null,
        description: description || null,
        kind,
        sort_order: maxOrder + 1,
      });
      if (error) throw new Error(error.message);
      setStatus(statusEl, "Uploaded! It'll appear on the site once the deploy finishes.", true);
      void renderImages(el);
    } catch (err) {
      setStatus(statusEl, "Error: " + (err instanceof Error ? err.message : String(err)), false);
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
    }
  });

  el.querySelectorAll<HTMLButtonElement>("[data-img-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.imgDel!;
      if (!(await confirmDialog(`Remove "${id}" from the site? This only removes the listing — the file stays in the GitHub repo.`))) return;
      btn.disabled = true;
      const { error } = await supabase.from("site_images").delete().eq("id", id);
      if (error) { alert("Error: " + error.message); btn.disabled = false; return; }
      void renderImages(el);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// RESUME TAB — upload the CV PDF that powers the résumé page's Download button
// ══════════════════════════════════════════════════════════════════════════════
async function renderResumeTab(el: HTMLElement): Promise<void> {
  const { data: files } = await supabase.storage
    .from(RESUME_PDF_BUCKET)
    .list("", { search: RESUME_PDF_FILE });
  const file = (files ?? []).find((f) => f.name === RESUME_PDF_FILE);
  const publicUrl = getResumePdfUrl();

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Résumé PDF</h3>
      <div id="resume-status" class="admin-status" style="display:none"></div>
      <p class="edu-note" style="margin-top:0;">
        ${file
          ? `Current file uploaded ${esc(new Date(file.updated_at ?? file.created_at ?? Date.now()).toLocaleString())}. <a class="link" href="${publicUrl}" target="_blank" rel="noopener">View current PDF ↗</a>`
          : "No résumé PDF uploaded yet — the Download CV button stays hidden on the résumé page until one is uploaded."}
      </p>
      <div class="admin-form">
        <div><label>Upload PDF (replaces current file)</label><input type="file" id="resume-file-input" accept="application/pdf"/></div>
        <div class="admin-form-actions">
          <button class="admin-btn admin-btn-primary" id="resume-upload-btn" disabled>Upload</button>
          ${file ? `<button class="admin-btn admin-btn-danger" id="resume-delete-btn">Delete current PDF</button>` : ""}
        </div>
      </div>
    </div>`;

  const statusEl = el.querySelector<HTMLElement>("#resume-status");
  const fileInput = el.querySelector<HTMLInputElement>("#resume-file-input")!;
  const uploadBtn = el.querySelector<HTMLButtonElement>("#resume-upload-btn")!;

  fileInput.addEventListener("change", () => {
    uploadBtn.disabled = !fileInput.files?.length;
  });

  uploadBtn.addEventListener("click", async () => {
    const pdf = fileInput.files?.[0];
    if (!pdf) return;
    if (pdf.type !== "application/pdf") {
      setStatus(statusEl, "File must be a PDF.", false);
      return;
    }
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading…";
    const { error } = await supabase.storage
      .from(RESUME_PDF_BUCKET)
      .upload(RESUME_PDF_FILE, pdf, { upsert: true, contentType: "application/pdf" });
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload";
    if (error) {
      setStatus(statusEl, "Error: " + error.message, false);
      return;
    }
    setStatus(statusEl, "Uploaded!", true);
    void renderResumeTab(el);
  });

  el.querySelector<HTMLButtonElement>("#resume-delete-btn")?.addEventListener("click", async (e) => {
    if (!(await confirmDialog("Delete the current résumé PDF? The Download CV button will disappear from the résumé page until you upload a new one."))) return;
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    const { error } = await supabase.storage.from(RESUME_PDF_BUCKET).remove([RESUME_PDF_FILE]);
    if (error) {
      alert("Error: " + error.message);
      btn.disabled = false;
      return;
    }
    void renderResumeTab(el);
  });
}

interface AdminBlogComment {
  id: number;
  slug: string;
  name: string;
  message: string;
  approved: boolean;
  created_at: string;
}

async function renderComments(el: HTMLElement): Promise<void> {
  const { data: rows } = await supabase
    .from("blog_comments")
    .select("*")
    .order("created_at", { ascending: false });

  const comments = (rows as AdminBlogComment[]) ?? [];
  const pending = comments.filter((c) => !c.approved);
  const approved = comments.filter((c) => c.approved);

  function commentRow(c: AdminBlogComment): string {
    return `
      <tr>
        <td style="white-space:nowrap">${esc(c.slug)}</td>
        <td style="white-space:nowrap">${esc(c.name)}</td>
        <td class="truncate">${esc(c.message)}</td>
        <td style="white-space:nowrap">${esc(c.created_at.slice(0, 10))}</td>
        <td style="white-space:nowrap">
          ${c.approved
            ? `<button class="admin-btn" data-comment-unapprove="${c.id}">Unpublish</button>`
            : `<button class="admin-btn admin-btn-primary" data-comment-approve="${c.id}">Approve</button>`}
          <button class="admin-btn admin-btn-danger" data-comment-del="${c.id}">Delete</button>
        </td>
      </tr>`;
  }

  el.innerHTML = `
    <h3 class="section" style="font-size:1.05em;margin-top:0;">Pending review (${pending.length})</h3>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Post</th><th>Name</th><th>Comment</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${pending.length ? pending.map(commentRow).join("") : emptyRow(5, "Nothing pending.")}</tbody>
    </table>
    </div>
    <h3 class="section" style="font-size:1.05em;margin-top:1.4rem;">Published (${approved.length})</h3>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Post</th><th>Name</th><th>Comment</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${approved.length ? approved.map(commentRow).join("") : emptyRow(5, "None yet.")}</tbody>
    </table>
    </div>`;

  el.querySelectorAll<HTMLButtonElement>("[data-comment-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await supabase.from("blog_comments").update({ approved: true }).eq("id", Number(btn.dataset.commentApprove));
      void renderComments(el);
    });
  });
  el.querySelectorAll<HTMLButtonElement>("[data-comment-unapprove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await supabase.from("blog_comments").update({ approved: false }).eq("id", Number(btn.dataset.commentUnapprove));
      void renderComments(el);
    });
  });
  el.querySelectorAll<HTMLButtonElement>("[data-comment-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this comment?"))) return;
      btn.disabled = true;
      await supabase.from("blog_comments").delete().eq("id", Number(btn.dataset.commentDel));
      void renderComments(el);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS TAB
// ══════════════════════════════════════════════════════════════════════════════
async function renderAnalytics(el: HTMLElement): Promise<void> {
  const rows = await getPageViews();
  const total = rows.reduce((sum, r) => sum + r.views, 0);

  el.innerHTML = `
    <p class="edu-note" style="margin-top:0;">
      Pageviews per route, tracked with no IP address, user agent, or fingerprint — just a counter per path.
      ${total.toLocaleString()} total view${total === 1 ? "" : "s"} across ${rows.length} route${rows.length === 1 ? "" : "s"}.
    </p>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Path</th><th>Views</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((r) => `
          <tr>
            <td>${esc(r.path)}</td>
            <td>${r.views.toLocaleString()}</td>
          </tr>`).join("") : emptyRow(2, "No pageviews recorded yet.")}
      </tbody>
    </table>
    </div>`;
}
