import { resume } from "../data/resume";
import { ACHIEVEMENTS, type DetailedAchievement } from "../data/achievements";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function chips(tags: string[]): string {
  return tags.map((t) => `<span class="pj-chip">${esc(t)}</span>`).join("");
}

function links(a: DetailedAchievement): string {
  const parts: string[] = [];
  if (a.verify) {
    parts.push(`<a class="pj-link pj-verify" href="#/gallery?img=${encodeURIComponent(a.verify)}">Verify ✓</a>`);
  }
  if (a.link) {
    const ext = a.link.href.startsWith("#") ? "" : ' target="_blank" rel="noopener"';
    parts.push(`<a class="pj-link" href="${a.link.href}"${ext}>${esc(a.link.label)} →</a>`);
  }
  return parts.length ? `<div class="pj-links">${parts.join("")}</div>` : "";
}

function block(a: DetailedAchievement, n: number): string {
  return `
    <li class="ach" id="${esc(a.id)}">
      <div class="pj-num">${String(n).padStart(2, "0")}</div>
      <div class="ach-content">
        <div class="ach-head">
          <h3 class="ach-title">${esc(a.title)}</h3>
          <span class="ach-date">${esc(a.date)}</span>
        </div>
        <div class="ach-chips">${chips(a.tags)}</div>
        <p class="ach-blurb">${a.blurb}</p>
        ${links(a)}
      </div>
    </li>`;
}

function pageHtml(): string {
  const blocks = ACHIEVEMENTS.map((a, i) => block(a, i + 1)).join("");
  return `
    <article class="page section-page achievements-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)} · Achievements</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Achievements</h2>
        <p class="edu-note">
          Honours and competitive results — tap <b>Verify</b> to open the certificate.
        </p>
        <ol class="ach-list pj-list">${blocks}</ol>
        <p class="section-more">
          <a class="section-back" href="#/gallery">View all certificates &amp; PDFs in the Gallery →</a>
        </p>
      </div>
    </article>`;
}

export function mountAchievements(container: HTMLElement): void {
  container.innerHTML = pageHtml();
}
