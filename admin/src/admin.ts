import { supabase, RESUME_PDF_BUCKET, RESUME_PDF_FILE, getResumePdfUrl, loadAllSiteImages, type DBSiteImage } from "./supabase";
import { confirmDialog } from "./confirm-dialog";
import { uploadFileToGithub, renameMedia } from "./publish";
import { esc, setStatus, emptyRow, errorText } from "./ui";

// A Supabase session is what gates writes (RLS checks is_admin() on the
// server). This client-side check only decides which screen to render.
export function mountAdmin(container: HTMLElement): void {
  container.innerHTML = `<p class="note">Loading…</p>`;
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) renderPanel(container);
    else renderLogin(container);
  });
}

// ── Login ──────────────────────────────────────────────────────────────────
function renderLogin(container: HTMLElement): void {
  container.innerHTML = `
    <form class="card login" id="login-form">
      <h2>Sign in</h2>
      <div id="login-err" class="status err" hidden></div>
      <label>Email<input type="email" id="login-email" autocomplete="username" required/></label>
      <label>Password<input type="password" id="login-pw" autocomplete="current-password" required/></label>
      <button type="submit" class="btn primary" id="login-btn">Sign in</button>
    </form>`;

  const form = container.querySelector<HTMLFormElement>("#login-form")!;
  const email = container.querySelector<HTMLInputElement>("#login-email")!;
  const pw = container.querySelector<HTMLInputElement>("#login-pw")!;
  const btn = container.querySelector<HTMLButtonElement>("#login-btn")!;
  const err = container.querySelector<HTMLElement>("#login-err")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = "Signing in…";
    err.hidden = true;
    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
    if (error) {
      btn.disabled = false;
      btn.textContent = "Sign in";
      err.textContent = "Incorrect email or password.";
      err.hidden = false;
      pw.value = "";
      pw.focus();
      return;
    }
    renderPanel(container);
  });
  email.focus();
}

// ── Panel ──────────────────────────────────────────────────────────────────
type Tab = "posts" | "achievements" | "images" | "resume";
const TABS: { id: Tab; label: string }[] = [
  { id: "posts", label: "Posts" },
  { id: "achievements", label: "Achievements" },
  { id: "images", label: "Images" },
  { id: "resume", label: "Resume" },
];

let currentTab: Tab = "posts";

function renderPanel(container: HTMLElement): void {
  container.innerHTML = `
    <header class="panel-head">
      <nav class="tabs">
        ${TABS.map((t) => `<button class="tab ${currentTab === t.id ? "active" : ""}" data-tab="${t.id}">${esc(t.label)}</button>`).join("")}
      </nav>
      <div class="actions">
        <button class="btn" id="account-toggle">Password</button>
        <button class="btn danger" id="logout">Log out</button>
      </div>
    </header>
    <div id="account-panel"></div>
    <div id="content"></div>`;

  container.querySelector("#logout")!.addEventListener("click", async () => {
    if (!(await confirmDialog("Log out of the admin?", "Log out"))) return;
    await supabase.auth.signOut();
    renderLogin(container);
  });

  const accountSlot = container.querySelector<HTMLElement>("#account-panel")!;
  container.querySelector("#account-toggle")!.addEventListener("click", () => {
    if (accountSlot.innerHTML) accountSlot.innerHTML = "";
    else renderAccountPanel(accountSlot);
  });

  container.querySelectorAll<HTMLButtonElement>(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab as Tab;
      container.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      loadTab(container);
    });
  });
  loadTab(container);
}

function renderAccountPanel(slot: HTMLElement): void {
  slot.innerHTML = `
    <section class="card">
      <h3>Change password</h3>
      <div id="pw-status" class="status" hidden></div>
      <div class="form">
        <div class="row">
          <label>New password<input type="password" id="pw1" autocomplete="new-password" placeholder="At least 8 characters"/></label>
          <label>Confirm<input type="password" id="pw2" autocomplete="new-password"/></label>
        </div>
        <div class="actions"><button type="button" class="btn primary" id="pw-save">Update password</button></div>
      </div>
    </section>`;
  const pw1 = slot.querySelector<HTMLInputElement>("#pw1")!;
  const pw2 = slot.querySelector<HTMLInputElement>("#pw2")!;
  const save = slot.querySelector<HTMLButtonElement>("#pw-save")!;
  const statusEl = slot.querySelector<HTMLElement>("#pw-status");
  save.addEventListener("click", async () => {
    if (pw1.value.length < 8) return setStatus(statusEl, "The password must be at least 8 characters.", false);
    if (pw1.value !== pw2.value) return setStatus(statusEl, "The passwords don't match.", false);
    save.disabled = true;
    const { error } = await supabase.auth.updateUser({ password: pw1.value });
    save.disabled = false;
    if (error) return setStatus(statusEl, `Error: ${error.message}`, false);
    pw1.value = pw2.value = "";
    setStatus(statusEl, "Password updated.", true);
  });
}

function loadTab(container: HTMLElement): void {
  const content = container.querySelector<HTMLElement>("#content")!;
  content.innerHTML = `<p class="note">Loading…</p>`;
  switch (currentTab) {
    case "posts":
      void import("./blog-editor").then(({ renderBlogEditor }) => renderBlogEditor(content));
      break;
    case "achievements": void renderAchievements(content); break;
    case "images": void renderImages(content); break;
    case "resume": void renderResume(content); break;
  }
}

// ── Achievements (the /achievements page) ──────────────────────────────────
interface Achievement {
  id: string;
  date: string;
  title: string | null;
  tags: string | null;
  blurb: string | null;
  verify: string | null;
  link_label: string | null;
  link_href: string | null;
  sort_order: number;
}

async function renderAchievements(el: HTMLElement): Promise<void> {
  const [{ data }, images] = await Promise.all([
    supabase.from("achievements").select("id,date,title,tags,blurb,verify,link_label,link_href,sort_order").order("sort_order"),
    loadAllSiteImages(),
  ]);
  const rows = (data ?? []) as Achievement[];
  const verifyOptions = images.filter((i) => i.kind === "gallery");

  el.innerHTML = `
    <section class="card">
      <h3>Add achievement</h3>
      <div id="ach-status-add" class="status" hidden></div>
      ${achievementForm("add", undefined, verifyOptions)}
    </section>
    <section class="card">
      <h3>Achievements</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Date</th><th>Credential</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map((a) => `
            <tr>
              <td class="truncate">${esc(a.title ?? a.id)}</td>
              <td class="nowrap">${esc(a.date)}</td>
              <td>${a.verify ? "Yes" : ""}</td>
              <td class="nowrap">
                <button class="btn" data-edit="${esc(a.id)}">Edit</button>
                <button class="btn danger" data-del="${esc(a.id)}">Delete</button>
              </td>
            </tr>
            <tr id="ach-edit-${esc(a.id)}" hidden>
              <td colspan="4">
                <div id="ach-status-${esc(a.id)}" class="status" hidden></div>
                ${achievementForm("edit", a, verifyOptions)}
              </td>
            </tr>`).join("") : emptyRow(4, "No achievements yet.")}
        </tbody>
      </table></div>
    </section>`;

  el.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = el.querySelector<HTMLElement>(`#ach-edit-${CSS.escape(btn.dataset.edit!)}`)!;
      row.hidden = !row.hidden;
    });
  });
  el.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.del!;
      if (!(await confirmDialog(`Delete the achievement "${id}"?`))) return;
      btn.disabled = true;
      const { error } = await supabase.from("achievements").delete().eq("id", id);
      if (error) { alert(`Error: ${error.message}`); btn.disabled = false; return; }
      void renderAchievements(el);
    });
  });
  el.querySelectorAll<HTMLButtonElement>("[data-ach-save]").forEach((btn) => {
    btn.addEventListener("click", () => void saveAchievement(el, btn, rows));
  });
}

function achievementForm(mode: "add" | "edit", a: Achievement | undefined, images: DBSiteImage[]): string {
  const v = (f: keyof Achievement) => esc(String(a?.[f] ?? ""));
  const key = mode === "edit" ? v("id") : "";
  const options = images
    .map((img) => `<option value="${esc(img.id)}" ${img.id === a?.verify ? "selected" : ""}>${esc(img.title)}</option>`)
    .join("");
  return `
    <div class="form" data-ach-form="${key}">
      <div class="row">
        <label>Title<input type="text" name="title" value="${v("title")}" placeholder="Award title"/></label>
        <label>Date<input type="text" name="date" value="${v("date")}" placeholder="2026"/></label>
      </div>
      <div class="row">
        <label>ID (slug)<input type="text" name="id" value="${v("id")}" ${mode === "edit" ? "readonly" : ""} placeholder="from the title"/></label>
        <label>Tags (comma-separated)<input type="text" name="tags" value="${v("tags")}" placeholder="Gold Medal, AI Challenge"/></label>
      </div>
      <label>Blurb (&lt;b&gt; and &lt;i&gt; allowed)<textarea name="blurb">${v("blurb")}</textarea></label>
      <label>Credential (from the Images tab)<select name="verify"><option value="">None</option>${options}</select></label>
      <div class="row">
        <label>Link label<input type="text" name="link_label" value="${v("link_label")}" placeholder="Program site"/></label>
        <label>Link URL<input type="text" name="link_href" value="${v("link_href")}" placeholder="https://..."/></label>
      </div>
      <div class="actions"><button type="button" class="btn primary" data-ach-save="${key}">${mode === "add" ? "Add" : "Save"}</button></div>
    </div>`;
}

async function saveAchievement(el: HTMLElement, btn: HTMLButtonElement, rows: Achievement[]): Promise<void> {
  const key = btn.dataset.achSave!;
  const existing = rows.find((r) => r.id === key);
  const form = el.querySelector<HTMLElement>(`[data-ach-form="${CSS.escape(key)}"]`)!;
  const statusEl = el.querySelector<HTMLElement>(`#ach-status-${key ? CSS.escape(key) : "add"}`);
  const g = (name: string) => (form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "").trim();
  const title = g("title");
  const id = g("id") || title.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  if (!title || !id) return setStatus(statusEl, "A title is required.", false);

  btn.disabled = true;
  const { error } = await supabase.from("achievements").upsert({
    id,
    title,
    date: g("date"),
    tags: g("tags") || null,
    blurb: g("blurb") || null,
    verify: g("verify") || null,
    link_label: g("link_label") || null,
    link_href: g("link_href") || null,
    sort_order: existing ? existing.sort_order : Math.max(0, ...rows.map((r) => r.sort_order)) + 1,
  });
  btn.disabled = false;
  if (error) return setStatus(statusEl, `Error: ${error.message}`, false);
  void renderAchievements(el);
}

// ── Images (Gallery page, credentials, blog covers) ────────────────────────
// Files are committed to static/gallery-media/ through GitHub; the
// site_images row is what the Gallery page and the pickers read.
function mediaThumb(src: string): string {
  if (/\.pdf$/i.test(src)) return `<span class="tag">PDF</span>`;
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(src)) return `<span class="tag">Video</span>`;
  if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(src)) return `<span class="tag">Audio</span>`;
  return `<img class="thumb" src="/${esc(src)}" alt="" loading="lazy"/>`;
}

function fileName(src: string): string {
  try {
    return decodeURIComponent(src.split("/").pop() ?? src);
  } catch {
    return src.split("/").pop() ?? src;
  }
}

function slugifyFilename(name: string): string {
  const slug = name.replace(/\.[^./]+$/, "").toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  return slug || `image-${Date.now()}`;
}

async function renderImages(el: HTMLElement): Promise<void> {
  const images = await loadAllSiteImages();

  el.innerHTML = `
    <section class="card">
      <h3>Upload</h3>
      <p class="note">The file is committed to GitHub and appears on the site after the next deploy (about 1-2 min).</p>
      <div id="img-status" class="status" hidden></div>
      <div class="form">
        <label>File (image, PDF, video or audio, up to 20 MB)<input type="file" id="img-file" accept="image/*,application/pdf,video/*,audio/*"/></label>
        <div class="row">
          <label>Title<input type="text" id="img-title" placeholder="Certificate title"/></label>
          <label>ID (slug)<input type="text" id="img-id" placeholder="from the file name"/></label>
        </div>
        <div class="row">
          <label>Date<input type="text" id="img-date" placeholder="2026"/></label>
          <label>Shows up in
            <select id="img-kind">
              <option value="gallery">Gallery and achievement credentials</option>
              <option value="blog-cover">Blog cover picker only</option>
              <option value="post-media">Used inside posts only (videos, audio, images)</option>
            </select>
          </label>
        </div>
        <label>Description<input type="text" id="img-desc" placeholder="Shown in the gallery viewer"/></label>
        <div class="actions"><button class="btn primary" id="img-upload" disabled>Upload</button></div>
      </div>
    </section>
    <section class="card">
      <h3>Files</h3>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Title</th><th>Kind</th><th></th></tr></thead>
        <tbody>
          ${images.length ? images.map((img) => `
            <tr>
              <td>${mediaThumb(img.src)}</td>
              <td class="truncate"><a href="/${esc(img.src)}" target="_blank" rel="noopener">${esc(img.title)}</a><div class="note">${esc(fileName(img.src))}</div></td>
              <td>${esc(img.kind)}</td>
              <td class="nowrap">
                <button class="btn" data-edit="${esc(img.id)}">Edit</button>
                <button class="btn danger" data-del="${esc(img.id)}">Remove</button>
              </td>
            </tr>
            <tr id="img-edit-${esc(img.id)}" hidden>
              <td colspan="4">
                <div class="status" hidden></div>
                <div class="form" data-img-form="${esc(img.id)}">
                  <div class="row">
                    <label>Title<input type="text" name="title" value="${esc(img.title)}"/></label>
                    <label>File name<input type="text" name="file" value="${esc(fileName(img.src))}"/></label>
                  </div>
                  <div class="row">
                    <label>Date<input type="text" name="date" value="${esc(img.date ?? "")}"/></label>
                    <label>Shows up in
                      <select name="kind">
                        <option value="gallery" ${img.kind === "gallery" ? "selected" : ""}>Gallery and achievement credentials</option>
                        <option value="blog-cover" ${img.kind === "blog-cover" ? "selected" : ""}>Blog cover picker only</option>
                        <option value="post-media" ${img.kind === "post-media" ? "selected" : ""}>Used inside posts only</option>
                      </select>
                    </label>
                  </div>
                  <label>Description<input type="text" name="description" value="${esc(img.description ?? "")}"/></label>
                  <p class="note">Changing the file name moves the file on GitHub and fixes every post that uses it, in one commit. The new name is live after the next deploy (about 1-2 min).</p>
                  <div class="actions"><button class="btn primary" data-save="${esc(img.id)}">Save</button></div>
                </div>
              </td>
            </tr>`).join("") : emptyRow(4, "No files yet.")}
        </tbody>
      </table></div>
    </section>`;

  const fileInput = el.querySelector<HTMLInputElement>("#img-file")!;
  const idInput = el.querySelector<HTMLInputElement>("#img-id")!;
  const titleInput = el.querySelector<HTMLInputElement>("#img-title")!;
  const uploadBtn = el.querySelector<HTMLButtonElement>("#img-upload")!;
  const statusEl = el.querySelector<HTMLElement>("#img-status");

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    uploadBtn.disabled = !f;
    if (f && !idInput.value) idInput.value = slugifyFilename(f.name);
    if (f && !titleInput.value) titleInput.value = f.name.replace(/\.[^./]+$/, "");
  });

  uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading…";
    try {
      const { src } = await uploadFileToGithub(file);
      const { error } = await supabase.from("site_images").upsert({
        id: idInput.value.trim() || slugifyFilename(file.name),
        title: titleInput.value.trim() || file.name,
        src,
        date: el.querySelector<HTMLInputElement>("#img-date")!.value.trim() || null,
        description: el.querySelector<HTMLInputElement>("#img-desc")!.value.trim() || null,
        kind: el.querySelector<HTMLSelectElement>("#img-kind")!.value,
        sort_order: Math.max(0, ...images.map((i) => i.sort_order)) + 1,
      });
      if (error) throw new Error(error.message);
      void renderImages(el);
    } catch (err) {
      setStatus(statusEl, `Error: ${errorText(err)}`, false);
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
    }
  });

  el.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = el.querySelector<HTMLElement>(`#img-edit-${CSS.escape(btn.dataset.edit!)}`)!;
      row.hidden = !row.hidden;
    });
  });

  el.querySelectorAll<HTMLButtonElement>("[data-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const img = images.find((i) => i.id === btn.dataset.save)!;
      const form = el.querySelector<HTMLElement>(`[data-img-form="${CSS.escape(img.id)}"]`)!;
      const rowStatus = form.parentElement!.querySelector<HTMLElement>(".status");
      const g = (name: string) => (form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "").trim();
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        let src = img.src;
        let note = "";
        const newName = g("file");
        if (newName && newName !== fileName(img.src)) {
          const renamed = await renameMedia(img.src, newName);
          src = renamed.src;
          if (renamed.updatedPosts.length) note = ` Updated ${renamed.updatedPosts.length} post(s) that used it.`;
          // Other listings of the same file follow it to the new name.
          const { error } = await supabase.from("site_images").update({ src }).eq("src", img.src);
          if (error) throw new Error(error.message);
        }
        const { error } = await supabase.from("site_images").update({
          title: g("title") || img.title,
          date: g("date") || null,
          description: g("description") || null,
          kind: g("kind"),
          src,
        }).eq("id", img.id);
        if (error) throw new Error(error.message);
        await renderImages(el);
        setStatus(el.querySelector<HTMLElement>("#img-status"), `Saved.${note}`, true);
      } catch (err) {
        setStatus(rowStatus, `Error: ${errorText(err)}`, false);
        btn.disabled = false;
        btn.textContent = "Save";
      }
    });
  });

  el.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.del!;
      if (!(await confirmDialog(`Remove "${id}" from the site? Only the listing is removed; the file stays in the repo.`, "Remove"))) return;
      btn.disabled = true;
      const { error } = await supabase.from("site_images").delete().eq("id", id);
      if (error) { alert(`Error: ${error.message}`); btn.disabled = false; return; }
      void renderImages(el);
    });
  });
}

// ── Resume (the CV PDF behind the Resume page) ─────────────────────────────
async function renderResume(el: HTMLElement): Promise<void> {
  const { data: files } = await supabase.storage.from(RESUME_PDF_BUCKET).list("", { search: RESUME_PDF_FILE });
  const file = (files ?? []).find((f) => f.name === RESUME_PDF_FILE);

  el.innerHTML = `
    <section class="card">
      <h3>Resume PDF</h3>
      <div id="resume-status" class="status" hidden></div>
      <p class="note">${file
        ? `Uploaded ${esc(new Date(file.updated_at ?? file.created_at ?? Date.now()).toLocaleString())}. <a href="${getResumePdfUrl()}" target="_blank" rel="noopener">Open the current PDF</a>`
        : "No PDF uploaded yet."}</p>
      <div class="form">
        <label>Upload a PDF (replaces the current one)<input type="file" id="resume-file" accept="application/pdf"/></label>
        <div class="actions">
          <button class="btn primary" id="resume-upload" disabled>Upload</button>
          ${file ? `<button class="btn danger" id="resume-delete">Delete current PDF</button>` : ""}
          <a class="btn" href="https://www.overleaf.com/project" target="_blank" rel="noopener">Open Overleaf</a>
        </div>
      </div>
    </section>`;

  const statusEl = el.querySelector<HTMLElement>("#resume-status");
  const fileInput = el.querySelector<HTMLInputElement>("#resume-file")!;
  const uploadBtn = el.querySelector<HTMLButtonElement>("#resume-upload")!;
  fileInput.addEventListener("change", () => { uploadBtn.disabled = !fileInput.files?.length; });

  uploadBtn.addEventListener("click", async () => {
    const pdf = fileInput.files?.[0];
    if (!pdf) return;
    if (pdf.type !== "application/pdf") return setStatus(statusEl, "The file must be a PDF.", false);
    uploadBtn.disabled = true;
    const { error } = await supabase.storage.from(RESUME_PDF_BUCKET).upload(RESUME_PDF_FILE, pdf, { upsert: true, contentType: "application/pdf" });
    uploadBtn.disabled = false;
    if (error) return setStatus(statusEl, `Error: ${error.message}`, false);
    void renderResume(el);
  });

  el.querySelector<HTMLButtonElement>("#resume-delete")?.addEventListener("click", async (e) => {
    if (!(await confirmDialog("Delete the current resume PDF? The Resume page has nothing to show until a new one is uploaded."))) return;
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    const { error } = await supabase.storage.from(RESUME_PDF_BUCKET).remove([RESUME_PDF_FILE]);
    if (error) { alert(`Error: ${error.message}`); btn.disabled = false; return; }
    void renderResume(el);
  });
}
