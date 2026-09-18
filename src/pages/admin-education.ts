// Education tab: the résumé's Education section (degree/institute/score/
// year + the Education page's tag/blurb elaboration), the official grade
// card (header fields + semesters, each with its own course list), and the
// Minor-in-Mathematics course list. All four map straight onto their own
// tables (education, grade_card_meta, grade_card_semesters +
// grade_card_courses, minor_courses) — plain supabase-js CRUD, RLS-gated on
// is_admin(), same as every other admin tab.

import { supabase } from "../lib/supabase";
import { confirmDialog } from "../lib/confirm-dialog";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

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

interface EducationRow {
  id: string;
  degree: string;
  institute: string;
  score: string;
  year: string;
  tag: string | null;
  blurb: string | null;
  sort_order: number;
}

interface GradeCardMeta {
  institute: string;
  programme: string;
  discipline: string;
  division: string;
  name: string;
  roll: string;
  admission: string;
  min_duration: string;
  cpi_sem1: string;
  cpi_sem2: string;
  status: string;
  issued: string;
}

interface GradeCardSemester {
  id: number;
  label: string;
  spi: string;
  sort_order: number;
}

interface GradeCardCourse {
  id: number;
  semester_id: number;
  code: string;
  name: string;
  credits: number;
  grade: string;
  sort_order: number;
}

interface MinorCourseRow {
  id: number;
  code: string;
  name: string;
  session: string;
  grade: string;
  sort_order: number;
}

export async function renderEducationTab(el: HTMLElement): Promise<void> {
  const [
    { data: eduRows },
    { data: metaRow },
    { data: semesterRows },
    { data: courseRows },
    { data: minorRows },
  ] = await Promise.all([
    supabase.from("education").select("*").order("sort_order"),
    supabase.from("grade_card_meta").select("*").eq("id", 1).maybeSingle<GradeCardMeta>(),
    supabase.from("grade_card_semesters").select("*").order("sort_order"),
    supabase.from("grade_card_courses").select("*").order("sort_order"),
    supabase.from("minor_courses").select("*").order("sort_order"),
  ]);

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Résumé education entries</h3>
      <p class="edu-note" style="margin-top:0;">Shown on the one-page résumé and, with the tag/blurb, elaborated on the standalone Education page.</p>
      <div id="edu-add-status" class="admin-status" style="display:none"></div>
      ${educationForm("add", undefined)}
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Degree</th><th>Institute</th><th>Year</th><th>Actions</th></tr></thead>
        <tbody id="edu-list"></tbody>
      </table>
    </div>

    <div class="admin-form-section">
      <h3>Grade card header</h3>
      <p class="edu-note" style="margin-top:0;">The provisional grade card's institute/name/roll fields on the Education page.</p>
      <div id="gcm-status" class="admin-status" style="display:none"></div>
      ${gradeCardMetaForm(metaRow ?? undefined)}
    </div>

    <div class="admin-form-section">
      <h3>Semesters</h3>
      <p class="edu-note" style="margin-top:0;">Each semester's course table on the grade card. Add a new one at the end of term.</p>
      <div id="sem-add-status" class="admin-status" style="display:none"></div>
      <div class="admin-form" data-sem-form="add">
        <div class="admin-form-row">
          <div><label>Label</label><input type="text" name="label" placeholder="Sem III — Monsoon Semester of AY 2026-27"/></div>
          <div><label>S.P.I</label><input type="text" name="spi" placeholder="9.50"/></div>
        </div>
        <div class="admin-form-actions">
          <button type="button" class="admin-btn admin-btn-primary" id="sem-add-submit">Add semester</button>
        </div>
      </div>
      <div id="sem-list"></div>
    </div>

    <div class="admin-form-section">
      <h3>Minor courses</h3>
      <p class="edu-note" style="margin-top:0;">The Minor in Mathematics course table, shown under that résumé entry.</p>
      <div id="minor-add-status" class="admin-status" style="display:none"></div>
      <div class="admin-form">
        <div class="admin-form-row">
          <div><label>Code</label><input type="text" id="minor-code" placeholder="MA1092M"/></div>
          <div><label>Session</label><input type="text" id="minor-session" placeholder="Jan–May 2026"/></div>
        </div>
        <div class="admin-form-row">
          <div><label>Course name</label><input type="text" id="minor-name" placeholder="Modern Algebra"/></div>
          <div><label>Grade</label><input type="text" id="minor-grade" placeholder="AB"/></div>
        </div>
        <div class="admin-form-actions">
          <button type="button" class="admin-btn admin-btn-primary" id="minor-add-btn">Add course</button>
        </div>
      </div>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Code</th><th>Course</th><th>Session</th><th>Grade</th><th>Actions</th></tr></thead>
        <tbody id="minor-list"></tbody>
      </table>
    </div>`;

  wireEducationEntries(el, (eduRows as EducationRow[] | null) ?? []);
  wireGradeCardMeta(el);
  wireSemesters(el, (semesterRows as GradeCardSemester[] | null) ?? [], (courseRows as GradeCardCourse[] | null) ?? []);
  wireMinorCourses(el, (minorRows as MinorCourseRow[] | null) ?? []);
}

// ── Résumé education entries ────────────────────────────────────────────
function educationForm(mode: "add" | "edit", r?: EducationRow): string {
  const v = (f: keyof EducationRow) => esc(String(r?.[f] ?? ""));
  const idAttr = mode === "edit" ? `data-edu-save="${v("id")}"` : `id="edu-add-submit"`;
  const prefix = mode === "edit" ? `edit-${v("id")}` : "add";
  return `
    <div class="admin-form" data-edu-form="${prefix}">
      <div class="admin-form-row">
        <div><label>ID (slug)</label><input type="text" name="id" value="${v("id")}" ${mode === "edit" ? "readonly" : ""} placeholder="btech-major"/></div>
        <div><label>Year</label><input type="text" name="year" value="${v("year")}" placeholder="2025-Present"/></div>
      </div>
      <div><label>Degree</label><input type="text" name="degree" value="${v("degree")}" placeholder="B.Tech. Major"/></div>
      <div><label>Institute</label><input type="text" name="institute" value="${v("institute")}" placeholder="Indian Institute of Technology, Guwahati"/></div>
      <div><label>Score</label><input type="text" name="score" value="${v("score")}" placeholder="9.52 (Current)"/></div>
      <div><label>Tag (badge on the Education page)</label><input type="text" name="tag" value="${v("tag")}" placeholder="Undergraduate · Ongoing"/></div>
      <div><label>Blurb (HTML allowed, shown on the Education page)</label><textarea name="blurb" style="min-height:70px">${v("blurb")}</textarea></div>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn admin-btn-primary" ${idAttr}>${mode === "add" ? "Add entry" : "Save changes"}</button>
      </div>
    </div>`;
}

function wireEducationEntries(el: HTMLElement, rows: EducationRow[]): void {
  const listEl = el.querySelector<HTMLElement>("#edu-list")!;

  function render(rows: EducationRow[]): void {
    listEl.innerHTML = rows.length
      ? rows.map((r) => `
        <tr id="edu-row-${esc(r.id)}">
          <td class="truncate">${esc(r.degree)}</td>
          <td class="truncate">${esc(r.institute)}</td>
          <td style="white-space:nowrap">${esc(r.year)}</td>
          <td>
            <button class="admin-btn" data-edu-edit="${esc(r.id)}">Edit</button>
            <button class="admin-btn admin-btn-danger" data-edu-del="${esc(r.id)}">Delete</button>
          </td>
        </tr>
        <tr id="edu-edit-${esc(r.id)}" style="display:none">
          <td colspan="4">
            <div id="edu-edit-status-${esc(r.id)}" class="admin-status" style="display:none"></div>
            ${educationForm("edit", r)}
          </td>
        </tr>`).join("")
      : emptyRow(4, "No education entries yet — add one above.");

    listEl.querySelectorAll<HTMLButtonElement>("[data-edu-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = listEl.querySelector<HTMLElement>(`#edu-edit-${CSS.escape(btn.dataset.eduEdit!)}`)!;
        row.style.display = row.style.display === "none" ? "table-row" : "none";
      });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-edu-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.eduDel!;
        if (!(await confirmDialog(`Delete education entry "${id}"?`))) return;
        btn.disabled = true;
        const { error } = await supabase.from("education").delete().eq("id", id);
        if (error) { alert("Error: " + error.message); btn.disabled = false; return; }
        rows = rows.filter((r) => r.id !== id);
        render(rows);
      });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-edu-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.eduSave!;
        await saveEducation(el, "edit", rows.find((r) => r.id === id)!, rows, btn, render);
      });
    });
  }

  el.querySelector<HTMLButtonElement>("#edu-add-submit")!.addEventListener("click", async (e) => {
    await saveEducation(el, "add", null, rows, e.currentTarget as HTMLButtonElement, render);
  });

  render(rows);
}

async function saveEducation(
  el: HTMLElement,
  mode: "add" | "edit",
  existing: EducationRow | null,
  rows: EducationRow[],
  triggerBtn: HTMLButtonElement,
  render: (rows: EducationRow[]) => void,
): Promise<void> {
  const prefix = mode === "edit" ? `edit-${existing!.id}` : "add";
  const form = el.querySelector<HTMLElement>(`[data-edu-form="${prefix}"]`)!;
  const statusId = mode === "edit" ? `edu-edit-status-${existing!.id}` : "edu-add-status";
  const statusEl = el.querySelector<HTMLElement>(`#${statusId}`);

  const g = (name: string) =>
    (form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? "").trim();
  const id = g("id");
  if (!id || !g("degree") || !g("institute")) {
    setStatus(statusEl, "ID, degree and institute are required.", false);
    return;
  }

  const row = {
    id,
    degree: g("degree"),
    institute: g("institute"),
    score: g("score"),
    year: g("year"),
    tag: g("tag") || null,
    blurb: g("blurb") || null,
    sort_order: mode === "edit" ? existing!.sort_order : Math.max(0, ...rows.map((r) => r.sort_order)) + 1,
  };

  triggerBtn.disabled = true;
  const originalLabel = triggerBtn.textContent;
  triggerBtn.textContent = "Saving…";

  const { error } = await supabase.from("education").upsert(row);
  triggerBtn.disabled = false;
  triggerBtn.textContent = originalLabel;
  if (error) {
    setStatus(statusEl, "Error: " + error.message, false);
    return;
  }
  setStatus(statusEl, mode === "add" ? "Added!" : "Saved!", true);

  const { data } = await supabase.from("education").select("*").order("sort_order");
  render((data as EducationRow[] | null) ?? []);
}

// ── Grade card meta (singleton) ─────────────────────────────────────────
function gradeCardMetaForm(m?: GradeCardMeta): string {
  const v = (f: keyof GradeCardMeta) => esc(String(m?.[f] ?? ""));
  return `
    <div class="admin-form" data-gcm-form="1">
      <div class="admin-form-row">
        <div><label>Institute</label><input type="text" name="institute" value="${v("institute")}"/></div>
        <div><label>Programme</label><input type="text" name="programme" value="${v("programme")}"/></div>
      </div>
      <div class="admin-form-row">
        <div><label>Discipline</label><input type="text" name="discipline" value="${v("discipline")}"/></div>
        <div><label>Division</label><input type="text" name="division" value="${v("division")}"/></div>
      </div>
      <div class="admin-form-row">
        <div><label>Name</label><input type="text" name="name" value="${v("name")}"/></div>
        <div><label>Roll No.</label><input type="text" name="roll" value="${v("roll")}"/></div>
      </div>
      <div class="admin-form-row">
        <div><label>Admission</label><input type="text" name="admission" value="${v("admission")}"/></div>
        <div><label>Min. duration</label><input type="text" name="min_duration" value="${v("min_duration")}"/></div>
      </div>
      <div class="admin-form-row">
        <div><label>CPI (previous semester)</label><input type="text" name="cpi_sem1" value="${v("cpi_sem1")}"/></div>
        <div><label>CPI (latest semester)</label><input type="text" name="cpi_sem2" value="${v("cpi_sem2")}"/></div>
      </div>
      <div class="admin-form-row">
        <div><label>Status</label><input type="text" name="status" value="${v("status")}" placeholder="Incomplete"/></div>
        <div><label>Issued</label><input type="text" name="issued" value="${v("issued")}" placeholder="27.05.2026"/></div>
      </div>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn admin-btn-primary" id="gcm-save">Save grade card header</button>
      </div>
    </div>`;
}

function wireGradeCardMeta(el: HTMLElement): void {
  const statusEl = el.querySelector<HTMLElement>("#gcm-status");
  const saveBtn = el.querySelector<HTMLButtonElement>("#gcm-save")!;
  const form = el.querySelector<HTMLElement>(`[data-gcm-form="1"]`)!;

  saveBtn.addEventListener("click", async () => {
    const g = (name: string) => (form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "").trim();
    const row = {
      id: 1,
      institute: g("institute"),
      programme: g("programme"),
      discipline: g("discipline"),
      division: g("division"),
      name: g("name"),
      roll: g("roll"),
      admission: g("admission"),
      min_duration: g("min_duration"),
      cpi_sem1: g("cpi_sem1"),
      cpi_sem2: g("cpi_sem2"),
      status: g("status"),
      issued: g("issued"),
    };
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    const { error } = await supabase.from("grade_card_meta").upsert(row);
    saveBtn.disabled = false;
    saveBtn.textContent = "Save grade card header";
    if (error) { setStatus(statusEl, "Error: " + error.message, false); return; }
    setStatus(statusEl, "Saved!", true);
  });
}

// ── Semesters + nested courses ──────────────────────────────────────────
function courseRowHtml(c?: GradeCardCourse): string {
  return `
    <div class="admin-link-row" data-course-row="1">
      <input type="text" name="c-code" value="${c ? esc(c.code) : ""}" placeholder="EE1115" style="max-width:6rem;"/>
      <input type="text" name="c-name" value="${c ? esc(c.name) : ""}" placeholder="Course name" style="flex:2;"/>
      <input type="number" name="c-credits" value="${c ? c.credits : ""}" placeholder="Cr." style="max-width:4rem;"/>
      <input type="text" name="c-grade" value="${c ? esc(c.grade) : ""}" placeholder="Gr." style="max-width:4rem;"/>
      <button type="button" class="admin-btn admin-btn-danger admin-rm-course">✕</button>
    </div>`;
}

function semesterForm(sem: GradeCardSemester, courses: GradeCardCourse[]): string {
  return `
    <div class="admin-form" data-sem-form="${sem.id}">
      <div class="admin-form-row">
        <div><label>Label</label><input type="text" name="label" value="${esc(sem.label)}"/></div>
        <div><label>S.P.I</label><input type="text" name="spi" value="${esc(sem.spi)}"/></div>
      </div>
      <div>
        <label>Courses</label>
        <div class="admin-link-list" id="sem-courses-${sem.id}">${courses.map((c) => courseRowHtml(c)).join("")}</div>
        <button type="button" class="admin-btn" id="sem-add-course-${sem.id}">+ Add course</button>
      </div>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn admin-btn-primary" data-sem-save="${sem.id}">Save semester</button>
        <button type="button" class="admin-btn admin-btn-danger" data-sem-del="${sem.id}">Delete semester</button>
      </div>
    </div>`;
}

function wireSemesters(el: HTMLElement, semesters: GradeCardSemester[], courses: GradeCardCourse[]): void {
  const listEl = el.querySelector<HTMLElement>("#sem-list")!;
  const coursesBySem = new Map<number, GradeCardCourse[]>();
  for (const c of courses) {
    const list = coursesBySem.get(c.semester_id) ?? [];
    list.push(c);
    coursesBySem.set(c.semester_id, list);
  }

  function wireCourseAdd(semId: number): void {
    el.querySelector<HTMLButtonElement>(`#sem-add-course-${semId}`)!.addEventListener("click", () => {
      const list = el.querySelector<HTMLElement>(`#sem-courses-${semId}`)!;
      const div = document.createElement("div");
      div.innerHTML = courseRowHtml();
      list.appendChild(div.firstElementChild!);
      wireCourseRemove();
    });
  }

  function wireCourseRemove(): void {
    el.querySelectorAll<HTMLButtonElement>(".admin-rm-course").forEach((btn) => {
      btn.onclick = () => btn.closest("[data-course-row]")?.remove();
    });
  }

  function render(): void {
    listEl.innerHTML = semesters.length
      ? semesters.map((s) => `
        <div class="admin-table-wrap" style="margin-top:0.6rem;">
          <div id="sem-status-${s.id}" class="admin-status" style="display:none"></div>
          ${semesterForm(s, coursesBySem.get(s.id) ?? [])}
        </div>`).join("")
      : `<p class="admin-empty-note">No semesters yet — add one above.</p>`;

    semesters.forEach((s) => {
      wireCourseAdd(s.id);
      el.querySelector<HTMLButtonElement>(`[data-sem-save="${s.id}"]`)!.addEventListener("click", async (e) => {
        await saveSemester(s.id, e.currentTarget as HTMLButtonElement);
      });
      el.querySelector<HTMLButtonElement>(`[data-sem-del="${s.id}"]`)!.addEventListener("click", async () => {
        if (!(await confirmDialog(`Delete "${s.label}" and all its courses? This can't be undone.`))) return;
        const { error } = await supabase.from("grade_card_semesters").delete().eq("id", s.id);
        if (error) { alert("Error: " + error.message); return; }
        await refresh();
      });
    });
    wireCourseRemove();
  }

  async function saveSemester(semId: number, triggerBtn: HTMLButtonElement): Promise<void> {
    const form = el.querySelector<HTMLElement>(`[data-sem-form="${semId}"]`)!;
    const statusEl = el.querySelector<HTMLElement>(`#sem-status-${semId}`);
    const label = form.querySelector<HTMLInputElement>('[name="label"]')!.value.trim();
    const spi = form.querySelector<HTMLInputElement>('[name="spi"]')!.value.trim();
    if (!label) { setStatus(statusEl, "Label is required.", false); return; }

    triggerBtn.disabled = true;
    const { error: semErr } = await supabase.from("grade_card_semesters").update({ label, spi }).eq("id", semId);
    if (semErr) { setStatus(statusEl, "Error: " + semErr.message, false); triggerBtn.disabled = false; return; }

    await supabase.from("grade_card_courses").delete().eq("semester_id", semId);
    const rows = Array.from(form.querySelectorAll<HTMLElement>("[data-course-row]"))
      .map((row, i) => ({
        semester_id: semId,
        code: row.querySelector<HTMLInputElement>('[name="c-code"]')!.value.trim(),
        name: row.querySelector<HTMLInputElement>('[name="c-name"]')!.value.trim(),
        credits: Number(row.querySelector<HTMLInputElement>('[name="c-credits"]')!.value) || 0,
        grade: row.querySelector<HTMLInputElement>('[name="c-grade"]')!.value.trim(),
        sort_order: i + 1,
      }))
      .filter((c) => c.code && c.name);
    if (rows.length > 0) {
      const { error: courseErr } = await supabase.from("grade_card_courses").insert(rows);
      if (courseErr) { setStatus(statusEl, "Courses error: " + courseErr.message, false); triggerBtn.disabled = false; return; }
    }
    triggerBtn.disabled = false;
    setStatus(statusEl, "Saved!", true);
    await refresh();
  }

  async function refresh(): Promise<void> {
    const [{ data: sems }, { data: crs }] = await Promise.all([
      supabase.from("grade_card_semesters").select("*").order("sort_order"),
      supabase.from("grade_card_courses").select("*").order("sort_order"),
    ]);
    semesters = (sems as GradeCardSemester[] | null) ?? [];
    coursesBySem.clear();
    for (const c of (crs as GradeCardCourse[] | null) ?? []) {
      const list = coursesBySem.get(c.semester_id) ?? [];
      list.push(c);
      coursesBySem.set(c.semester_id, list);
    }
    render();
  }

  el.querySelector<HTMLButtonElement>("#sem-add-submit")!.addEventListener("click", async () => {
    const form = el.querySelector<HTMLElement>(`[data-sem-form="add"]`)!;
    const statusEl = el.querySelector<HTMLElement>("#sem-add-status");
    const label = form.querySelector<HTMLInputElement>('[name="label"]')!.value.trim();
    const spi = form.querySelector<HTMLInputElement>('[name="spi"]')!.value.trim();
    if (!label) { setStatus(statusEl, "Label is required.", false); return; }
    const maxOrder = Math.max(0, ...semesters.map((s) => s.sort_order));
    const { error } = await supabase.from("grade_card_semesters").insert({ label, spi, sort_order: maxOrder + 1 });
    if (error) { setStatus(statusEl, "Error: " + error.message, false); return; }
    (form.querySelector<HTMLInputElement>('[name="label"]')!).value = "";
    (form.querySelector<HTMLInputElement>('[name="spi"]')!).value = "";
    setStatus(statusEl, "Semester added — add its courses below, then Save.", true);
    await refresh();
  });

  render();
}

// ── Minor courses ────────────────────────────────────────────────────────
function wireMinorCourses(el: HTMLElement, rows: MinorCourseRow[]): void {
  const listEl = el.querySelector<HTMLElement>("#minor-list")!;

  function render(rows: MinorCourseRow[]): void {
    listEl.innerHTML = rows.length
      ? rows.map((r) => `
        <tr>
          <td>${esc(r.code)}</td>
          <td class="truncate">${esc(r.name)}</td>
          <td style="white-space:nowrap">${esc(r.session)}</td>
          <td>${esc(r.grade)}</td>
          <td><button class="admin-btn admin-btn-danger" data-minor-del="${r.id}">Delete</button></td>
        </tr>`).join("")
      : emptyRow(5, "No minor courses yet — add one above.");

    listEl.querySelectorAll<HTMLButtonElement>("[data-minor-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!(await confirmDialog("Delete this minor course?"))) return;
        btn.disabled = true;
        const { error } = await supabase.from("minor_courses").delete().eq("id", Number(btn.dataset.minorDel));
        if (error) { alert("Error: " + error.message); btn.disabled = false; return; }
        rows = rows.filter((r) => r.id !== Number(btn.dataset.minorDel));
        render(rows);
      });
    });
  }

  const statusEl = el.querySelector<HTMLElement>("#minor-add-status");
  const addBtn = el.querySelector<HTMLButtonElement>("#minor-add-btn")!;
  addBtn.addEventListener("click", async () => {
    const code = el.querySelector<HTMLInputElement>("#minor-code")!.value.trim();
    const name = el.querySelector<HTMLInputElement>("#minor-name")!.value.trim();
    const session = el.querySelector<HTMLInputElement>("#minor-session")!.value.trim();
    const grade = el.querySelector<HTMLInputElement>("#minor-grade")!.value.trim();
    if (!code || !name) { setStatus(statusEl, "Code and course name are required.", false); return; }
    addBtn.disabled = true;
    const maxOrder = Math.max(0, ...rows.map((r) => r.sort_order));
    const { data, error } = await supabase
      .from("minor_courses")
      .insert({ code, name, session, grade, sort_order: maxOrder + 1 })
      .select()
      .maybeSingle<MinorCourseRow>();
    addBtn.disabled = false;
    if (error) { setStatus(statusEl, "Error: " + error.message, false); return; }
    setStatus(statusEl, "Added!", true);
    el.querySelector<HTMLInputElement>("#minor-code")!.value = "";
    el.querySelector<HTMLInputElement>("#minor-name")!.value = "";
    el.querySelector<HTMLInputElement>("#minor-session")!.value = "";
    el.querySelector<HTMLInputElement>("#minor-grade")!.value = "";
    if (data) rows = [...rows, data];
    render(rows);
  });

  render(rows);
}
