import { resume } from "../data/resume";
import { PROJECTS, type DetailedProject } from "../data/projects";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function chips(stack: string[]): string {
  return stack.map((t) => `<span class="pj-chip">${esc(t)}</span>`).join("");
}

function linkBtn(p: DetailedProject): string {
  const parts: string[] = [];
  if (p.body) {
    parts.push(`<a class="pj-link" href="#/project?id=${encodeURIComponent(p.id)}">Full write-up →</a>`);
  }
  if (p.github) {
    parts.push(`<a class="pj-link" href="${p.github}" target="_blank" rel="noopener">View on GitHub ↗</a>`);
  } else if (p.link) {
    parts.push(`<a class="pj-link" href="${p.link.href}" target="_blank" rel="noopener">${esc(p.link.label)} ↗</a>`);
  }
  if (p.verifyImg) {
    parts.push(`<a class="pj-link pj-verify" href="#/gallery?img=${encodeURIComponent(p.verifyImg)}">Verify ✓</a>`);
  } else if (p.verify) {
    parts.push(`<a class="pj-link pj-verify" href="#/gallery?img=${encodeURIComponent(p.verify)}">View work</a>`);
  }
  return parts.length ? `<div class="pj-links">${parts.join("")}</div>` : "";
}

function projectBlock(p: DetailedProject, n: number): string {
  // Detail paragraphs intentionally allow trusted inline <b>/<i> markup.
  const paras = p.detail.map((d) => `<p>${d}</p>`).join("");
  const hl = p.highlights.map((h) => `<li>${esc(h)}</li>`).join("");
  return `
    <li class="pj" id="${p.id}">
      <div class="pj-num">${String(n).padStart(2, "0")}</div>
      <div class="pj-content">
        <div class="pj-head">
          <h3 class="pj-title">${esc(p.title)}</h3>
          <span class="pj-date">${esc(p.date)}</span>
        </div>
        <p class="pj-tagline">${esc(p.tagline)}</p>
        <div class="pj-chips">${chips(p.stack)}</div>
        <div class="pj-detail">${paras}</div>
        <div class="pj-hl">
          <span class="pj-hl-label">Highlights</span>
          <ul>${hl}</ul>
        </div>
        ${linkBtn(p)}
      </div>
    </li>`;
}

function pageHtml(): string {
  const blocks = PROJECTS.map((p, i) => projectBlock(p, i + 1)).join("");
  return `
    <article class="page section-page projects-page">
      <nav class="section-nav">
        <a class="section-back" href="#/resume">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)} · Projects</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Projects</h2>
        <p class="edu-note">
          ${PROJECTS.length} selected projects, explained in depth — one after another.
        </p>
        <ol class="pj-list">${blocks}</ol>
      </div>
    </article>`;
}

// Projects page is fully static (its own curated, detailed write-ups), so
// there is nothing async to load — render once.
export function mountProjects(container: HTMLElement): void {
  container.innerHTML = pageHtml();
}
