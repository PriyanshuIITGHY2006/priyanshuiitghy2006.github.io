import { resume } from "../data/resume";
import { setPageMeta } from "../lib/seo";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

export function mountNotFound(container: HTMLElement): void {
  setPageMeta({ title: "404 — Page Not Found", noindex: true });
  container.innerHTML = `
    <article class="page section-page not-found-page">
      <nav class="section-nav">
        <a class="section-back" href="#/resume">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)}</span>
      </nav>
      <div class="section-body not-found-body">
        <h2 class="section not-found-code">404</h2>
        <p class="edu-note not-found-msg">Segmentation fault — this page doesn't exist (core not dumped, don't worry).</p>
        <p class="edu-note">
          <a class="link" href="#/">Head back home</a>, or try the
          <a class="link" href="#/blogs">blog</a> or
          <a class="link" href="#/projects">projects</a>.
        </p>
      </div>
    </article>`;
}
