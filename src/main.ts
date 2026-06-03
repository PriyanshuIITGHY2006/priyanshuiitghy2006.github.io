import "./styles/resume.css";
import { resume } from "./data/resume";
import { renderResume } from "./render/resume";

const PAPER_WIDTH = 794; // A4 width in px at 96dpi
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

let userZoom = 1; // multiplied on top of the fit-to-width scale

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  html = ""
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (html) el.innerHTML = html;
  return el;
}

function buildToolbar(): HTMLElement {
  const bar = h("div", { class: "toolbar" });
  bar.innerHTML = `
    <div class="tb-group tb-left">
      <span class="tb-doc" title="${resume.pdfName}">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V7h3.5L13 3.5z"/></svg>
        ${resume.pdfName}
      </span>
    </div>
    <div class="tb-group tb-center">
      <button class="tb-btn" id="zoom-out" title="Zoom out" aria-label="Zoom out">&#8722;</button>
      <span class="tb-zoom" id="zoom-label">100%</span>
      <button class="tb-btn" id="zoom-in" title="Zoom in" aria-label="Zoom in">&#43;</button>
      <button class="tb-btn tb-fit" id="zoom-fit" title="Fit to width">Fit</button>
    </div>
    <div class="tb-group tb-right">
      <button class="tb-btn" id="theme-toggle" title="Toggle theme" aria-label="Toggle theme">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.5 5.5 0 0 1-7.54-7.54c-.44-.06-.9-.1-1.36-.1z"/></svg>
      </button>
      <a class="tb-btn tb-download" id="download" href="${resume.pdfUrl}" download>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 3v10.6l3.3-3.3 1.4 1.4L12 17.4l-4.7-4.7 1.4-1.4L12 13.6V3zM5 19h14v2H5z"/></svg>
        <span class="tb-download-text">Download PDF</span>
      </a>
    </div>`;
  return bar;
}

function applyLayout(): void {
  const stage = document.querySelector<HTMLElement>(".stage");
  const holder = document.querySelector<HTMLElement>(".paper-holder");
  const paper = document.querySelector<HTMLElement>(".paper");
  const zoomLabel = document.querySelector<HTMLElement>("#zoom-label");
  if (!stage || !holder || !paper) return;

  const avail = stage.clientWidth - 40; // breathing room
  const fit = Math.min(1, avail / PAPER_WIDTH);
  const scale = fit * userZoom;

  paper.style.transform = `scale(${scale})`;
  const naturalHeight = paper.offsetHeight; // unscaled (transform doesn't change offsetHeight)
  holder.style.width = `${PAPER_WIDTH * scale}px`;
  holder.style.height = `${naturalHeight * scale}px`;

  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function setZoom(z: number): void {
  userZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  applyLayout();
}

function initTheme(): void {
  const saved = localStorage.getItem("cv-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
}

function toggleTheme(): void {
  const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("cv-theme", next);
}

// Future hook: every clickable element with a data-detail will eventually open
// a rich detail panel (and pull content from Supabase). For now we let the
// native link navigate, but route the intent through one place.
function wireDetailClicks(): void {
  document.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-detail]");
    if (!target) return;
    const id = target.getAttribute("data-detail");
    // Phase 2 will intercept here (e.preventDefault) and open a detail view.
    console.debug("[detail]", id);
  });
}

function mount(): void {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;

  initTheme();

  const toolbar = buildToolbar();
  const stage = h("div", { class: "stage" });
  const holder = h("div", { class: "paper-holder" });
  const paper = h("article", { class: "paper", id: "cv" });
  paper.innerHTML = renderResume(resume);

  holder.appendChild(paper);
  stage.appendChild(holder);
  app.appendChild(toolbar);
  app.appendChild(stage);

  // Controls
  document.querySelector("#zoom-in")?.addEventListener("click", () => setZoom(userZoom + ZOOM_STEP));
  document.querySelector("#zoom-out")?.addEventListener("click", () => setZoom(userZoom - ZOOM_STEP));
  document.querySelector("#zoom-fit")?.addEventListener("click", () => setZoom(1));
  document.querySelector("#theme-toggle")?.addEventListener("click", toggleTheme);

  wireDetailClicks();

  // Layout now and on resize. Fonts can shift metrics, so re-run when ready.
  applyLayout();
  window.addEventListener("resize", applyLayout);
  if (document.fonts?.ready) document.fonts.ready.then(applyLayout);
  // Safety re-layout after web fonts settle.
  setTimeout(applyLayout, 400);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
