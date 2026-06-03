import type { ResumeData, RichLine, Project } from "../types";

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

// Only escapes plain-text fragments. Bullet/achievement strings intentionally
// allow trusted inline markup authored in resume.ts.
function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function projectHTML(p: Project): string {
  const link = p.link
    ? `<a class="link proj-link" data-detail="${p.link.detail ?? p.id}" href="${p.link.href}"${
        p.link.external ? ' target="_blank" rel="noopener"' : ""
      }>${escapeText(p.link.text)}</a>`
    : "";
  const bullets = p.bullets
    .map((b) => `<li class="subitem">${b}</li>`)
    .join("");
  return `
    <li class="project" data-project="${p.id}">
      <div class="proj-head">
        <span class="proj-title">${escapeText(p.title)}</span>
        <span class="proj-date">${escapeText(p.date)}</span>
      </div>
      <div class="proj-sub">
        <span class="proj-stack">${escapeText(p.stack)}</span>
        ${link}
      </div>
      <ul class="sublist">${bullets}</ul>
    </li>`;
}

function sectionTitle(title: string): string {
  return `<div class="section-title">${title}</div><div class="titlerule"></div>`;
}

export function renderResume(data: ResumeData): string {
  // ── Header ──────────────────────────────────────────────────────────
  const identity = data.identity.map((l) => `<div class="id-line">${escapeText(l)}</div>`).join("");
  const contact = data.contact.map((l) => `<div class="contact-line">${richLine(l)}</div>`).join("");

  const header = `
    <header class="cv-header">
      <div class="header-left">
        <div class="cv-name">${escapeText(data.name)}</div>
        ${identity}
      </div>
      <div class="header-right">${contact}</div>
    </header>`;

  // ── Education ───────────────────────────────────────────────────────
  const eduRows = data.education
    .map(
      (r) => `
      <tr>
        <td class="td-left">${escapeText(r.degree)}</td>
        <td class="td-left">${escapeText(r.institute)}</td>
        <td>${escapeText(r.score)}</td>
        <td>${escapeText(r.year)}</td>
      </tr>`
    )
    .join("");
  const education = `
    <section>
      ${sectionTitle("Education")}
      <table class="edu-table">
        <thead>
          <tr>
            <th>Degree/Certificate</th>
            <th>Institute/Board</th>
            <th>CGPA/Percentage</th>
            <th>Year</th>
          </tr>
        </thead>
        <tbody>${eduRows}</tbody>
      </table>
    </section>`;

  // ── Projects ────────────────────────────────────────────────────────
  const projects = `
    <section>
      ${sectionTitle("Projects")}
      <ul class="project-list">${data.projects.map(projectHTML).join("")}</ul>
    </section>`;

  // ── Technical Skills ────────────────────────────────────────────────
  const skills = `
    <section>
      ${sectionTitle("Technical Skills")}
      <ul class="bullet-list">
        ${data.skills
          .map((s) => `<li class="item"><b>${escapeText(s.label)}:</b> ${s.items}</li>`)
          .join("")}
      </ul>
    </section>`;

  // ── Positions of Responsibility ─────────────────────────────────────
  const positions = `
    <section>
      ${sectionTitle("Positions of Responsibility")}
      <ul class="bullet-list">
        ${data.positions
          .map(
            (p) =>
              `<li class="item dated"><span class="item-text">${p.html}</span><span class="item-date">${escapeText(
                p.date
              )}</span></li>`
          )
          .join("")}
      </ul>
    </section>`;

  // ── Achievements ────────────────────────────────────────────────────
  const achievements = `
    <section>
      ${sectionTitle("Achievements")}
      <ul class="bullet-list">
        ${data.achievements
          .map(
            (a) =>
              `<li class="item dated" data-achievement="${a.id}"><span class="item-text">${a.html}</span><span class="item-date">${escapeText(
                a.date
              )}</span></li>`
          )
          .join("")}
      </ul>
    </section>`;

  return header + education + projects + skills + positions + achievements;
}
