import "../styles/admin.css";
import { supabase } from "../lib/supabase";
import { confirmDialog } from "../lib/confirm-dialog";
import { getPageViews } from "../lib/analytics";

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
        <a class="section-back" href="#/">← back to résumé</a>
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
type Tab = "projects" | "achievements" | "skills" | "positions" | "comments" | "blog-editor" | "analytics";
const TABS: { id: Tab; label: string }[] = [
  { id: "projects", label: "Projects" },
  { id: "achievements", label: "Achievements" },
  { id: "skills", label: "Skills" },
  { id: "positions", label: "Positions" },
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
        <a class="section-back" href="#/">← back to résumé</a>
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
// PROJECTS TAB
// ══════════════════════════════════════════════════════════════════════════════
async function renderProjects(el: HTMLElement): Promise<void> {
  const [{ data: projects }, { data: bullets }] = await Promise.all([
    supabase.from("projects").select("*").order("sort_order"),
    supabase.from("project_bullets").select("*").order("sort_order"),
  ]);

  const bulletsByProject = new Map<string, { id: number; bullet: string }[]>();
  for (const b of bullets ?? []) {
    const list = bulletsByProject.get(b.project_id) ?? [];
    list.push({ id: b.id, bullet: b.bullet });
    bulletsByProject.set(b.project_id, list);
  }

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Add project</h3>
      <div id="proj-add-status" class="admin-status" style="display:none"></div>
      ${projectForm("add")}
    </div>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Title</th><th>Date</th><th>Stack</th><th>Bullets</th><th>Actions</th></tr></thead>
      <tbody>
        ${(projects ?? []).length ? (projects ?? []).map((p) => `
          <tr id="proj-row-${esc(p.id)}">
            <td class="truncate">${esc(p.title)}</td>
            <td style="white-space:nowrap">${esc(p.date)}</td>
            <td class="truncate">${esc(p.stack)}</td>
            <td>${(bulletsByProject.get(p.id) ?? []).length}</td>
            <td>
              <button class="admin-btn" data-proj-edit="${esc(p.id)}">Edit</button>
              <button class="admin-btn admin-btn-danger" data-proj-del="${esc(p.id)}">Delete</button>
            </td>
          </tr>
          <tr id="proj-edit-${esc(p.id)}" style="display:none">
            <td colspan="5">
              <div id="proj-edit-status-${esc(p.id)}" class="admin-status" style="display:none"></div>
              ${projectForm("edit", p, bulletsByProject.get(p.id) ?? [])}
            </td>
          </tr>`).join("") : emptyRow(5, "No projects yet — add one above.")}
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
      if (!(await confirmDialog(`Delete project "${id}" and all its bullets? This can't be undone.`))) return;
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
}

function projectForm(
  mode: "add" | "edit",
  p?: Record<string, string | number | null>,
  existingBullets?: { id: number; bullet: string }[],
): string {
  const v = (f: string) => esc(String(p?.[f] ?? ""));
  const id = mode === "edit" ? `data-proj-save="${v("id")}"` : `id="proj-add-submit"`;
  const bullets = existingBullets ?? [];
  const bulletRows = bullets
    .map((b, i) => `
      <div class="admin-bullet-row" data-bullet-idx="${i}">
        <textarea name="bullet">${esc(b.bullet)}</textarea>
        <button type="button" class="admin-btn admin-btn-danger admin-rm-bullet">✕</button>
      </div>`)
    .join("");
  const prefix = mode === "edit" ? `edit-${v("id")}` : "add";
  return `
    <div class="admin-form" data-proj-form="${prefix}">
      <div class="admin-form-row">
        <div><label>ID (slug)</label><input type="text" name="id" value="${v("id")}" ${mode === "edit" ? "readonly" : ""} placeholder="my-project"/></div>
        <div><label>Date</label><input type="text" name="date" value="${v("date")}" placeholder="Jan 2026 – Present"/></div>
      </div>
      <div><label>Title</label><input type="text" name="title" value="${v("title")}" placeholder="Project Title"/></div>
      <div><label>Stack</label><input type="text" name="stack" value="${v("stack")}" placeholder="Python, PyTorch"/></div>
      <div class="admin-form-row">
        <div><label>Link Text</label><input type="text" name="link_text" value="${v("link_text")}" placeholder="Github"/></div>
        <div><label>Link URL</label><input type="text" name="link_href" value="${v("link_href")}" placeholder="https://..."/></div>
      </div>
      <div><label>Link Detail ID</label><input type="text" name="link_detail" value="${v("link_detail")}" placeholder="my-project"/></div>
      <div>
        <label>Bullets</label>
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
  existing: Record<string, string | number | null> | null,
  triggerBtn: HTMLButtonElement,
): Promise<void> {
  const prefix = mode === "edit" ? `edit-${existing!.id}` : "add";
  const form = el.querySelector<HTMLElement>(`[data-proj-form="${prefix}"]`)!;
  const statusId = mode === "edit" ? `proj-edit-status-${existing!.id}` : "proj-add-status";
  const statusEl = el.querySelector<HTMLElement>(`#${statusId}`);

  const g = (name: string) => (form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "").trim();
  const id = g("id");
  if (!id || !g("title") || !g("stack")) {
    setStatus(statusEl, "ID, Title and Stack are required.", false);
    return;
  }

  const row = {
    id,
    title: g("title"),
    date: g("date"),
    stack: g("stack"),
    link_text: g("link_text") || null,
    link_href: g("link_href") || null,
    link_detail: g("link_detail") || null,
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

  setStatus(statusEl, mode === "add" ? "Project added!" : "Saved!", true);
  void renderProjects(el);
}

// Bullet add/remove (event delegation, set once on the el)
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
});

// ══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS TAB
// ══════════════════════════════════════════════════════════════════════════════
async function renderAchievements(el: HTMLElement): Promise<void> {
  const { data: rows } = await supabase.from("achievements").select("*").order("sort_order");

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Add achievement</h3>
      <div id="ach-add-status" class="admin-status" style="display:none"></div>
      <div class="admin-form" id="ach-add-form">
        <div class="admin-form-row">
          <div><label>ID (slug)</label><input type="text" id="ach-id" placeholder="jee-main"/></div>
          <div><label>Date</label><input type="text" id="ach-date" placeholder="2025"/></div>
        </div>
        <div><label>HTML content</label><textarea id="ach-html" style="min-height:72px" placeholder="&lt;b&gt;Title&lt;/b&gt; Description"></textarea></div>
        <div class="admin-form-actions">
          <button class="admin-btn admin-btn-primary" id="ach-add-btn">Add achievement</button>
        </div>
      </div>
    </div>
    <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>ID</th><th>HTML (truncated)</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>
        ${(rows ?? []).length ? (rows ?? []).map((a) => `
          <tr>
            <td>${esc(a.id)}</td>
            <td class="truncate">${esc(a.html)}</td>
            <td>${esc(a.date)}</td>
            <td>
              <button class="admin-btn admin-btn-danger" data-ach-del="${esc(a.id)}">Delete</button>
            </td>
          </tr>`).join("") : emptyRow(4, "No achievements yet — add one above.")}
      </tbody>
    </table>
    </div>`;

  const addBtn = el.querySelector<HTMLButtonElement>("#ach-add-btn")!;
  addBtn.addEventListener("click", async () => {
    const id = (el.querySelector<HTMLInputElement>("#ach-id")!.value).trim();
    const html = (el.querySelector<HTMLTextAreaElement>("#ach-html")!.value).trim();
    const date = (el.querySelector<HTMLInputElement>("#ach-date")!.value).trim();
    const statusEl = el.querySelector<HTMLElement>("#ach-add-status");
    if (!id || !html) { setStatus(statusEl, "ID and HTML are required.", false); return; }
    addBtn.disabled = true;
    const maxOrder = Math.max(0, ...(rows ?? []).map((r) => r.sort_order));
    const { error } = await supabase.from("achievements").insert({ id, html, date, sort_order: maxOrder + 1 });
    if (error) { setStatus(statusEl, "Error: " + error.message, false); addBtn.disabled = false; return; }
    setStatus(statusEl, "Added!", true);
    void renderAchievements(el);
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
