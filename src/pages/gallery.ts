import { resume } from "../data/resume";
import { GALLERY, type GalleryItem } from "../data/gallery";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// onerror placeholder: swap a broken/missing image for an "awaiting upload" tile.
const ONERR =
  "this.classList.add('gl-img-missing');this.removeAttribute('src');" +
  "this.onerror=null;";

function card(item: GalleryItem): string {
  return `
    <button class="gl-card" data-img="${esc(item.id)}" title="${esc(item.title)}">
      <span class="gl-thumb">
        <img src="${esc(item.src)}" alt="${esc(item.title)}" loading="lazy" onerror="${ONERR}"/>
        <span class="gl-thumb-ph" aria-hidden="true">Awaiting upload</span>
      </span>
      <span class="gl-meta">
        <span class="gl-card-title">${esc(item.title)}</span>
        ${item.date ? `<span class="gl-card-date">${esc(item.date)}</span>` : ""}
      </span>
    </button>`;
}

function pageHtml(): string {
  const body = GALLERY.length
    ? `<div class="gl-grid">${GALLERY.map(card).join("")}</div>`
    : `<p class="gl-empty">No images yet — drop files into <code>public/gallery/</code> and list them in <code>src/data/gallery.ts</code>.</p>`;
  return `
    <article class="page section-page gallery-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)} · Gallery</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Gallery</h2>
        <p class="edu-note">
          Certificates, achievement scorecards and project screenshots.
          Click any image to view it full-screen — each has a shareable link.
        </p>
        ${body}
      </div>

      <div class="gl-lightbox" id="gl-lightbox" hidden>
        <div class="gl-lb-backdrop" data-close></div>
        <button class="gl-lb-close" data-close aria-label="Close">×</button>
        <button class="gl-lb-nav gl-lb-prev" data-prev aria-label="Previous">‹</button>
        <button class="gl-lb-nav gl-lb-next" data-next aria-label="Next">›</button>
        <figure class="gl-lb-figure">
          <img class="gl-lb-img" id="gl-lb-img" alt=""/>
          <figcaption class="gl-lb-cap">
            <span class="gl-lb-title" id="gl-lb-title"></span>
            <span class="gl-lb-desc" id="gl-lb-desc"></span>
            <span class="gl-lb-actions">
              <a class="gl-lb-action" id="gl-lb-original" target="_blank" rel="noopener">Open original ↗</a>
              <button class="gl-lb-action" id="gl-lb-copy">Copy link</button>
            </span>
          </figcaption>
        </figure>
      </div>
    </article>`;
}

let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function mountGallery(container: HTMLElement, initialImg?: string | null): void {
  container.innerHTML = pageHtml();

  const lb = container.querySelector<HTMLElement>("#gl-lightbox")!;
  const img = container.querySelector<HTMLImageElement>("#gl-lb-img")!;
  const titleEl = container.querySelector<HTMLElement>("#gl-lb-title")!;
  const descEl = container.querySelector<HTMLElement>("#gl-lb-desc")!;
  const original = container.querySelector<HTMLAnchorElement>("#gl-lb-original")!;
  const copyBtn = container.querySelector<HTMLButtonElement>("#gl-lb-copy")!;

  let current = -1;

  const setUrl = (id: string | null) => {
    const hash = id ? `#/gallery?img=${encodeURIComponent(id)}` : "#/gallery";
    history.replaceState(null, "", hash);
  };

  function open(index: number): void {
    const item = GALLERY[index];
    if (!item) return;
    current = index;
    img.src = item.src;
    img.alt = item.title;
    img.classList.remove("gl-zoom", "gl-img-missing");
    titleEl.textContent = item.title;
    descEl.textContent = item.description ?? "";
    original.href = item.src;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    setUrl(item.id);
  }

  function close(): void {
    lb.hidden = true;
    document.body.style.overflow = "";
    current = -1;
    setUrl(null);
  }

  const step = (delta: number) => {
    if (current < 0) return;
    open((current + delta + GALLERY.length) % GALLERY.length);
  };

  // Card clicks → open
  container.querySelectorAll<HTMLElement>(".gl-card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-img");
      const idx = GALLERY.findIndex((g) => g.id === id);
      if (idx >= 0) open(idx);
    });
  });

  // Lightbox controls
  lb.querySelectorAll<HTMLElement>("[data-close]").forEach((el) =>
    el.addEventListener("click", close)
  );
  lb.querySelector<HTMLElement>("[data-prev]")?.addEventListener("click", () => step(-1));
  lb.querySelector<HTMLElement>("[data-next]")?.addEventListener("click", () => step(1));
  img.addEventListener("click", () => img.classList.toggle("gl-zoom"));

  copyBtn.addEventListener("click", async () => {
    const item = GALLERY[current];
    if (!item) return;
    const url = `${location.origin}${location.pathname}#/gallery?img=${encodeURIComponent(item.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = "Copied ✓";
    } catch {
      copyBtn.textContent = url;
    }
    setTimeout(() => (copyBtn.textContent = "Copy link"), 1800);
  });

  // Keyboard: Esc / arrows (replace any stale handler from a prior mount)
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = (e: KeyboardEvent) => {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  };
  document.addEventListener("keydown", keyHandler);

  // Deep-link: open the requested image immediately
  if (initialImg) {
    const idx = GALLERY.findIndex((g) => g.id === initialImg);
    if (idx >= 0) open(idx);
  }
}
