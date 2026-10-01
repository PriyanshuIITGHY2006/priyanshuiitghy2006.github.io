import { resume } from "../data/resume";
import { PROJECTS, type DetailedProject } from "../data/projects";
import { loadDetailedProjectsFromDB } from "../lib/supabase";

// Projects as a sliding deck: a horizontal row of summary cards. The card in
// focus is full size and the others recede; the focused project's full
// write-up opens in the panel underneath, so nothing from the data is lost.

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function links(p: DetailedProject): string {
  const parts: string[] = [];
  const ext = (href: string, label: string) =>
    `<a class="pd-link" href="${href}" target="_blank" rel="noopener">${esc(label)}</a>`;
  if (p.body) parts.push(`<a class="pd-link" href="/project?id=${encodeURIComponent(p.id)}">Full write-up</a>`);
  if (p.github) parts.push(ext(p.github, "GitHub"));
  else if (p.link) parts.push(ext(p.link.href, p.link.label));
  for (const l of p.extraLinks ?? []) parts.push(ext(l.href, l.label));
  if (p.verifyImg) parts.push(`<a class="pd-link" href="/gallery?img=${encodeURIComponent(p.verifyImg)}">Show credential</a>`);
  else if (p.verify) parts.push(`<a class="pd-link" href="/gallery?img=${encodeURIComponent(p.verify)}">View work</a>`);
  return parts.length ? `<div class="pd-links">${parts.join("")}</div>` : "";
}

function card(p: DetailedProject, i: number, total: number): string {
  return `
    <li class="pd-card" data-i="${i}" id="${p.id}" aria-roledescription="slide" aria-label="${i + 1} of ${total}">
      <p class="pd-meta">${esc(p.date)}</p>
      <h3 class="pd-title">${esc(p.title)}</h3>
      <p class="pd-tagline">${esc(p.tagline)}</p>
      <p class="pd-stack">${p.stack.map(esc).join(" · ")}</p>
      <ul class="pd-hl">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
      <button class="pd-open" type="button" data-i="${i}">Read more</button>
    </li>`;
}

function detail(p: DetailedProject): string {
  // Detail paragraphs intentionally allow trusted inline <b>/<i> markup.
  return `
    <h3 class="pd-detail-title">${esc(p.title)}</h3>
    <p class="pd-detail-meta">${esc(p.date)} · ${p.stack.map(esc).join(" · ")}</p>
    <div class="pd-detail-body">${p.detail.map((d) => `<p>${d}</p>`).join("")}</div>
    ${links(p)}`;
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
        <div class="pd-head">
          <h2 class="section">Projects</h2>
          <div class="pd-controls">
            <span class="pd-count" aria-live="polite"></span>
            <button class="pd-nav" type="button" data-step="-1" aria-label="Previous project">‹</button>
            <button class="pd-nav" type="button" data-step="1" aria-label="Next project">›</button>
          </div>
        </div>
        <ol class="pd-track" tabindex="0" aria-roledescription="carousel" aria-label="Projects">
          ${projects.map((p, i) => card(p, i, total)).join("")}
        </ol>
        <div class="pd-index">${projects
          .map((p, i) => `<button type="button" data-i="${i}">${esc(p.title.split(" — ")[0])}</button>`)
          .join("")}</div>
        <section class="pd-detail" aria-live="polite"></section>
      </div>
    </article>`;
}

/** Wires one rendered deck: focus tracking, controls, keyboard, detail panel. */
function initDeck(root: HTMLElement, projects: DetailedProject[]): void {
  const track = root.querySelector<HTMLElement>(".pd-track");
  const panel = root.querySelector<HTMLElement>(".pd-detail");
  const count = root.querySelector<HTMLElement>(".pd-count");
  if (!track || !panel || !count || !projects.length) return;
  const cards = [...track.querySelectorAll<HTMLElement>(".pd-card")];
  const indexBtns = [...root.querySelectorAll<HTMLButtonElement>(".pd-index button")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let active = -1;

  const showDetail = (i: number) => {
    panel.innerHTML = detail(projects[i]);
    panel.classList.remove("is-in");
    void panel.offsetWidth; // restart the fade
    panel.classList.add("is-in");
  };

  // Each card's scale/opacity follows its distance from the track centre,
  // so focus slides continuously rather than snapping between states.
  const update = () => {
    const box = track.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let best = 0, bestD = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      const t = Math.min(1, d / r.width);
      c.style.setProperty("--focus", (1 - t).toFixed(3));
      if (d < bestD) (bestD = d), (best = i);
    });
    if (best !== active) {
      active = best;
      cards.forEach((c, i) => c.classList.toggle("is-active", i === active));
      indexBtns.forEach((b, i) => b.classList.toggle("is-active", i === active));
      count.textContent = `${String(active + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
      showDetail(active);
    }
  };

  const go = (i: number) => {
    const c = cards[Math.max(0, Math.min(cards.length - 1, i))];
    track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  };

  let raf = 0;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  }, { passive: true });
  root.querySelectorAll<HTMLButtonElement>(".pd-nav").forEach((b) =>
    b.addEventListener("click", () => go(active + Number(b.dataset.step))));
  indexBtns.forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.i))));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") (e.preventDefault(), go(active + 1));
    if (e.key === "ArrowLeft") (e.preventDefault(), go(active - 1));
  });
  // Clicking a receding card brings it into focus; "Read more" jumps to the panel.
  track.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    const open = el.closest<HTMLElement>(".pd-open");
    if (open) {
      const i = Number(open.dataset.i);
      if (i !== active) go(i);
      panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      return;
    }
    const c = el.closest<HTMLElement>(".pd-card");
    if (c && Number(c.dataset.i) !== active && !el.closest("a")) go(Number(c.dataset.i));
  });
  const onResize = () => (track.isConnected ? update() : window.removeEventListener("resize", onResize));
  window.addEventListener("resize", onResize, { passive: true });

  update();
  const start = projects.findIndex((p) => p.id === location.hash.slice(1));
  if (start > 0) go(start);
}

export function mountProjects(container: HTMLElement): void {
  const render = (projects: DetailedProject[]) => {
    container.innerHTML = pageHtml(projects);
    initDeck(container, projects);
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
