import type { ResumeData, RichLine, Project, Position, Achievement } from "../types";

// Render a RichLine (array of plain/linked fragments) to HTML.
function richLine(line: RichLine): string {
  return line
    .map((f) => {
      if (!f.href) return escapeText(f.text);
      const ext = f.external ? ' target="_blank" rel="noopener"' : "";
      const detail = f.detail ? ` data-detail="${f.detail}"` : "";
      return `<a class="link"${detail} href="${f.href}"${ext}>${escapeText(f.text)}</a>`;
    })
    .join("");
}

// Escapes plain-text fragments only. Bullet/achievement/skill strings
// intentionally allow trusted inline markup authored in resume.ts.
function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

// Each résumé section links to its own standalone page (hash route).
export const SECTION_ROUTES: Record<string, string> = {
  Education: "/education",
  Projects: "/projects",
  "Technical Skills": "/skills",
  "Positions of Responsibility": "/positions",
  Achievements: "/achievements",
};

function sectionTitle(title: string, linked = true): string {
  // Mirrors \titleformat{\section}{\scshape\raggedright\large}{}{0em}{}[\titlerule]
  const route = SECTION_ROUTES[title];
  if (linked && route) {
    return `<h2 class="section"><a class="section-link" href="#${route}">${title}<span class="section-arrow" aria-hidden="true">→</span></a></h2>`;
  }
  return `<h2 class="section">${title}</h2>`;
}

// ── Header (LaTeX: \parbox{logo} \parbox{tabularx{name & phone \\ ...}}) ──
function header(data: ResumeData): string {
  const rows: { left: string; right: string; nameRow?: boolean }[] = [
    {
      left: `<span class="name">${escapeText(data.name)}</span>`,
      right: richLine(data.contact[0]),
      nameRow: true,
    },
    { left: escapeText(data.identity[0]), right: richLine(data.contact[1]) },
    { left: escapeText(data.identity[1]), right: richLine(data.contact[2]) },
    { left: escapeText(data.identity[2]), right: richLine(data.contact[3]) },
    { left: escapeText(data.identity[3]), right: richLine(data.contact[4]) },
  ];
  const trs = rows
    .map(
      (r) =>
        `<tr${r.nameRow ? ' class="name-row"' : ""}><td class="hl">${r.left}</td><td class="hr">${r.right}</td></tr>`
    )
    .join("");
  return `
    <header class="cv-head">
      <div class="cv-logo">
        <img src="iitg_logo.jpg" alt="IIT Guwahati"
             onerror="this.closest('.cv-head').classList.add('no-logo')"/>
      </div>
      <table class="cv-head-tab"><tbody>${trs}</tbody></table>
    </header>`;
}

// ── Education table (LaTeX: |c|C|c|c| — col 2 wraps, others centered) ──
export function education(data: ResumeData, linked = true): string {
  const rows = data.education
    .map(
      (r) => `
      <tr>
        <td>${escapeText(r.degree)}</td>
        <td class="td-wrap">${escapeText(r.institute)}</td>
        <td>${escapeText(r.score)}</td>
        <td>${escapeText(r.year)}</td>
      </tr>`
    )
    .join("");
  return `
    ${sectionTitle("Education", linked)}
    <table class="edu-table">
      <thead>
        <tr>
          <th>Degree/Certificate</th>
          <th>Institute/Board</th>
          <th>CGPA/Percentage</th>
          <th>Year</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── \resumeProject: 2-row tabular* (title|date / italic stack|italic link) ──
function project(p: Project): string {
  const link = p.link
    ? `<a class="link proj-link" data-detail="${p.link.detail ?? p.id}" href="${p.link.href}"${
        p.link.external ? ' target="_blank" rel="noopener"' : ""
      }>${escapeText(p.link.text)}</a>`
    : "";
  const bullets = p.bullets.map((b) => `<li>${b}</li>`).join("");
  return `
    <li class="proj" data-project="${p.id}">
      <div class="proj-grid">
        <div class="pg-title"><b>${escapeText(p.title)}</b></div>
        <div class="pg-date"><i>${escapeText(p.date)}</i></div>
        <div class="pg-stack"><i>${escapeText(p.stack)}</i></div>
        <div class="pg-link">${link}</div>
      </div>
      <ul class="proj-bullets">${bullets}</ul>
    </li>`;
}

export function projects(data: ResumeData, linked = true): string {
  return `
    ${sectionTitle("Projects", linked)}
    <ul class="proj-list">${data.projects.map(project).join("")}</ul>`;
}

// ── \resumeSubItem: \textbf{label}: items ──
export function skills(data: ResumeData, linked = true): string {
  const items = data.skills
    .map((s) => `<li><b>${s.label}</b>: ${s.items}</li>`)
    .join("");
  return `
    ${sectionTitle("Technical Skills", linked)}
    <ul class="skill-list">${items}</ul>`;
}

// ── \resumePOR: \textbf{title}, rest | italic small date ──
function porLine(p: Position | Achievement, dataAttr = ""): string {
  return `
    <li${dataAttr}>
      <span class="por-text">${p.html}</span>
      <span class="por-date"><i>${escapeText(p.date)}</i></span>
    </li>`;
}

export function positions(data: ResumeData, linked = true): string {
  return `
    ${sectionTitle("Positions of Responsibility", linked)}
    <ul class="por-list">${data.positions.map((p) => porLine(p)).join("")}</ul>`;
}

export function achievements(data: ResumeData, linked = true): string {
  return `
    ${sectionTitle("Achievements", linked)}
    <ul class="por-list">${data.achievements
      .map((a) => porLine(a, ` data-achievement="${a.id}"`))
      .join("")}</ul>`;
}

// ── Single-section renderer (used by the standalone section pages) ──────
export type SectionKey =
  | "education"
  | "projects"
  | "skills"
  | "positions"
  | "achievements";

export function renderSection(key: SectionKey, data: ResumeData): string {
  switch (key) {
    case "education":
      return education(data, false);
    case "projects":
      return projects(data, false);
    case "skills":
      return skills(data, false);
    case "positions":
      return positions(data, false);
    case "achievements":
      return achievements(data, false);
  }
}

export function renderResume(data: ResumeData): string {
  return (
    header(data) +
    education(data) +
    projects(data) +
    skills(data) +
    positions(data) +
    achievements(data) +
    `<hr class="bottom-rule"/>`
  );
}
