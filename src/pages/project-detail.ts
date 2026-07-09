import "../styles/blog.css";
import "katex/dist/katex.min.css";
import { resume } from "../data/resume";
import { PROJECTS, type DetailedProject } from "../data/projects";
import { renderMarkdown } from "../lib/blog";
import { setPageMeta } from "../lib/seo";
import { initEditors } from "./blog-post";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function chips(stack: string[]): string {
  return stack.map((t) => `<span class="pj-chip">${esc(t)}</span>`).join("");
}

function notFoundHtml(): string {
  return `
    <article class="page section-page project-detail-page">
      <nav class="section-nav">
        <a class="section-back" href="#/projects">← back to projects</a>
        <span class="section-crumb">${esc(resume.name)} · Projects</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Write-up not found</h2>
        <p class="edu-note">This project may not have a deep-dive page yet.</p>
        <a class="pj-link" href="#/projects">← All projects</a>
      </div>
    </article>`;
}

function pageHtml(project: DetailedProject): string {
  const contentHtml = renderMarkdown(project.body ?? "");
  return `
    <article class="page section-page project-detail-page">
      <nav class="section-nav">
        <a class="section-back" href="#/projects">← back to projects</a>
        <span class="section-crumb">${esc(resume.name)} · Projects</span>
      </nav>
      <div class="section-body">
        <header class="blog-post-head">
          <h1 class="blog-post-title">${esc(project.title)}</h1>
          <div class="blog-post-meta">
            <span class="blog-post-date">${esc(project.date)}</span>
          </div>
          <div class="pj-chips" style="margin-top: 0.7rem;">${chips(project.stack)}</div>
        </header>
        <div class="blog-content" id="project-content">${contentHtml}</div>
        ${project.github ? `<div class="pj-links" style="margin-top: 1.8rem;"><a class="pj-link" href="${project.github}" target="_blank" rel="noopener">View on GitHub ↗</a></div>` : ""}
        <div class="section-more" style="margin-top: 2rem;">
          <a class="pj-link" href="#/projects">← All projects</a>
        </div>
      </div>
    </article>`;
}

export function mountProjectDetail(container: HTMLElement, id: string | null): void {
  const project = PROJECTS.find((p) => p.id === id && p.body);
  if (project) {
    setPageMeta({ title: project.title, description: project.tagline, type: "article" });
  } else {
    setPageMeta({ title: "Write-up Not Found", noindex: true });
  }
  container.innerHTML = project ? pageHtml(project) : notFoundHtml();
  if (project) void initEditors(container);
}
