import { resume } from "../data/resume";
import { PROJECTS, type DetailedProject } from "../data/projects";
import { loadDetailedProjectsFromDB } from "../lib/supabase";
import type { ProjectStack } from "../lib/projects-webgl";

// Projects as a stack of portrait cards. Scrolling (or swiping) down deals
// the next card up from below onto the pile; the top card's short write-up
// sits beside the stack, and "Full write-up" opens everything in a dialog.
// With WebGL2 the cards are real 3D cards (lib/projects-webgl.ts); without
// it the same stack is drawn with DOM cards and CSS transforms.

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

const pad = (n: number) => String(n).padStart(2, "0");

function extLinks(p: DetailedProject): string {
  const parts: string[] = [];
  const ext = (href: string, label: string) =>
    `<a class="ps-link" href="${href}" target="_blank" rel="noopener">${esc(label)}</a>`;
  if (p.github) parts.push(ext(p.github, "GitHub"));
  else if (p.link) parts.push(ext(p.link.href, p.link.label));
  for (const l of p.extraLinks ?? []) parts.push(ext(l.href, l.label));
  if (p.verifyImg) parts.push(`<a class="ps-link" href="/gallery?img=${encodeURIComponent(p.verifyImg)}">Show credential</a>`);
  else if (p.verify) parts.push(`<a class="ps-link" href="/gallery?img=${encodeURIComponent(p.verify)}">View work</a>`);
  return parts.join("");
}

/** The short write-up beside the stack. */
function summary(p: DetailedProject, i: number, total: number): string {
  return `
    <p class="ps-meta">${pad(i + 1)} / ${pad(total)} · ${esc(p.date)}</p>
    <h3 class="ps-title">${esc(p.title)}</h3>
    <p class="ps-tagline">${esc(p.tagline)}</p>
    <p class="ps-stack-line">${p.stack.map(esc).join(" · ")}</p>
    <ul class="ps-hl">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
    <div class="ps-links">
      <button class="ps-open" type="button" data-i="${i}">Full write-up</button>
      ${extLinks(p)}
    </div>`;
}

/** Everything, for the dialog. Detail paragraphs allow trusted inline <b>/<i>. */
function fullWriteUp(p: DetailedProject): string {
  return `
    <p class="ps-meta">${esc(p.date)}</p>
    <h3 class="ps-dialog-title">${esc(p.title)}</h3>
    <p class="ps-tagline">${esc(p.tagline)}</p>
    <p class="ps-stack-line">${p.stack.map(esc).join(" · ")}</p>
    <div class="ps-body">${p.detail.map((d) => `<p>${d}</p>`).join("")}</div>
    <p class="ps-hl-label">Highlights</p>
    <ul class="ps-hl">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
    <div class="ps-links">
      ${p.body ? `<a class="ps-link" href="/project?id=${encodeURIComponent(p.id)}">Read the deep-dive</a>` : ""}
      ${extLinks(p)}
    </div>`;
}

function domCard(p: DetailedProject, i: number, total: number): string {
  return `
    <div class="ps-card" data-i="${i}" aria-hidden="true">
      <p class="ps-card-num">${pad(i + 1)} / ${pad(total)}</p>
      <p class="ps-card-date">${esc(p.date)}</p>
      <h4 class="ps-card-title">${esc(p.title)}</h4>
      <p class="ps-card-stack">${p.stack.map(esc).join(" · ")}</p>
    </div>`;
}

function pageHtml(projects: DetailedProject[]): string {
  const total = projects.length;
  return `
    <article class="page section-page projects-page">
      <nav class="section-nav">
        <a class="section-back" href="/">← back</a>
        <span class="section-crumb">${esc(resume.name)} · Projects</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Projects</h2>
        <p class="ps-hint">Scroll to deal the next card onto the stack.</p>
      </div>
      <section class="ps-scroller" style="--n:${total}">
        <div class="ps-sticky">
          <div class="ps-stage">${projects.map((p, i) => domCard(p, i, total)).join("")}</div>
          <div class="ps-side">
            <div class="ps-summary" aria-live="polite"></div>
            <div class="ps-index">${projects
              .map((p, i) => `<button type="button" data-i="${i}" aria-label="${esc(p.title)}"></button>`)
              .join("")}</div>
          </div>
        </div>
      </section>
      <dialog class="ps-dialog" aria-label="Project write-up">
        <button class="ps-close" type="button" aria-label="Close">Close</button>
        <div class="ps-dialog-body"></div>
      </dialog>
    </article>`;
}

/** Wires one rendered page; returns a getter for the project in focus. */
function initStack(root: HTMLElement, projects: DetailedProject[], startId: string): () => string {
  const scroller = root.querySelector<HTMLElement>(".ps-scroller");
  const stage = root.querySelector<HTMLElement>(".ps-stage");
  const side = root.querySelector<HTMLElement>(".ps-summary");
  const dialog = root.querySelector<HTMLDialogElement>(".ps-dialog");
  if (!scroller || !stage || !side || !dialog || !projects.length) return () => startId;
  const domCards = [...stage.querySelectorAll<HTMLElement>(".ps-card")];
  const dots = [...root.querySelectorAll<HTMLButtonElement>(".ps-index button")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const last = projects.length - 1;
  let gl: ProjectStack | null = null;
  let active = -1;

  // Scroll position → continuous stack progress 0 … last.
  const progress = () => {
    const span = scroller.offsetHeight - window.innerHeight;
    const y = -scroller.getBoundingClientRect().top;
    return span > 0 ? Math.max(0, Math.min(1, y / span)) * last : 0;
  };
  const scrollToCard = (i: number) => {
    const span = scroller.offsetHeight - window.innerHeight;
    const top = scroller.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (span * Math.max(0, Math.min(last, i))) / Math.max(1, last), behavior: reduce ? "auto" : "smooth" });
  };

  const setActive = (i: number) => {
    if (i === active) return;
    active = i;
    side.innerHTML = summary(projects[i], i, projects.length);
    side.classList.remove("is-in");
    void side.offsetWidth; // restart the fade
    side.classList.add("is-in");
    dots.forEach((d, j) => d.classList.toggle("is-active", j === i));
  };

  // DOM fallback: the same deal-from-below stack with CSS transforms.
  const layoutDom = (p: number) => {
    domCards.forEach((c, i) => {
      const s = i - p;
      const tilt = ((i * 37) % 9) - 4;
      if (s <= 0) {
        c.style.transform = `translate(${tilt * 1.5}px, ${s * 6}px) rotate(${tilt * 0.7}deg)`;
        c.style.opacity = String(Math.max(0, 1 + s * 0.25));
      } else if (s < 1) {
        const e = s * s;
        c.style.transform = `translate(${tilt * 1.5 + e * 60}px, ${e * 110}vh) rotate(${tilt * 0.7 + e * 14}deg)`;
        c.style.opacity = "1";
      } else {
        c.style.transform = "translate(0, 110vh)";
        c.style.opacity = "0";
      }
      c.style.zIndex = String(i);
    });
  };

  const onScroll = () => {
    if (!scroller.isConnected) return window.removeEventListener("scroll", onScroll);
    const p = progress();
    setActive(Math.round(p));
    if (gl) gl.setProgress(p);
    else layoutDom(p);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // Full write-up dialog.
  const body = dialog.querySelector<HTMLElement>(".ps-dialog-body")!;
  const open = (i: number) => {
    body.innerHTML = fullWriteUp(projects[i]);
    dialog.showModal();
    dialog.scrollTop = 0;
    document.documentElement.classList.add("ps-locked");
  };
  dialog.addEventListener("close", () => document.documentElement.classList.remove("ps-locked"));
  dialog.querySelector(".ps-close")!.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // backdrop
  });
  side.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".ps-open");
    if (b) open(Number(b.dataset.i));
  });
  dots.forEach((d) => d.addEventListener("click", () => scrollToCard(Number(d.dataset.i))));

  const start = projects.findIndex((p) => p.id === startId);
  onScroll();
  if (start > 0) scrollToCard(start);

  // Upgrade to real 3D cards when the GPU allows (three.js loads only here).
  if (!reduce) {
    void import("../lib/projects-webgl")
      .then(({ mountProjectStack }) => {
        if (!stage.isConnected) return;
        const s = mountProjectStack(stage, projects, { onOpen: () => open(active) });
        if (!s) return;
        gl = s;
        stage.classList.add("is-3d");
        gl.setProgress(progress(), true);
      })
      .catch(() => {
        // Keep the DOM stack.
      });
  }
  return () => projects[Math.max(0, active)]?.id ?? startId;
}

export function mountProjects(container: HTMLElement): void {
  let shown = "";
  let current = () => location.hash.slice(1);
  const render = (projects: DetailedProject[]) => {
    const key = JSON.stringify(projects);
    if (key === shown) return; // same data (e.g. the DB fell back to static)
    shown = key;
    const keep = current();
    container.innerHTML = pageHtml(projects);
    current = initStack(container, projects, keep);
  };
  // Render static content immediately — no blank flash while the DB loads.
  render(PROJECTS);

  loadDetailedProjectsFromDB()
    .then((live) => {
      if (live.length) render(live);
    })
    .catch(() => {
      // DB unreachable — static version already shown
    });
}
