import "../styles/blog.css";
import { resume } from "../data/resume";
import { BLOG_POSTS, formatBlogDate, estimateReadingMinutes, getAllTags, type BlogPost } from "../lib/blog";
import { SCROLL_TOP_BUTTON_HTML, initScrollTopButton } from "../lib/scroll-top";
import { SUBSCRIBE_FORM_HTML, wireSubscribeForm } from "../lib/subscribe";
import { mountBlogGraph } from "../lib/blog-graph";
import { toggleSpotifyPlayer, isSpotifyPlayerOpen } from "../lib/spotify-player";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function tagChips(tags: string[]): string {
  if (!tags.length) return "";
  return `<div class="blog-card-tags">${tags
    .map((t) => `<span class="blog-tag">${esc(t)}</span>`)
    .join("")}</div>`;
}

function searchHaystack(p: BlogPost): string {
  return [p.title, p.excerpt, p.tags.join(" ")].join(" ").toLowerCase();
}

function card(p: BlogPost): string {
  const thumb = p.cover
    ? `<div class="blog-card-thumb"><img src="${esc(p.cover)}" alt="" loading="lazy"/></div>`
    : `<div class="blog-card-thumb blog-card-thumb-empty" aria-hidden="true">§</div>`;
  return `
    <a class="blog-card" href="#/blog?slug=${encodeURIComponent(p.slug)}"
       data-search="${esc(searchHaystack(p))}"
       data-tags="${esc(p.tags.map((t) => t.toLowerCase()).join("|"))}">
      ${thumb}
      <div class="blog-card-body">
        ${p.date ? `<div class="blog-card-date">${esc(formatBlogDate(p.date))} · ${estimateReadingMinutes(p.rawBody)} min read</div>` : ""}
        <h3 class="blog-card-title">${esc(p.title)}</h3>
        ${p.excerpt ? `<p class="blog-card-excerpt">${esc(p.excerpt)}</p>` : ""}
        ${tagChips(p.tags)}
      </div>
    </a>`;
}

function controlsHtml(): string {
  const tags = getAllTags();
  if (!BLOG_POSTS.length) return "";
  const tagOptions = tags
    .map((t) => `<option value="${esc(t.toLowerCase())}">${esc(t)}</option>`)
    .join("");
  return `
    <div class="blog-controls">
      <input
        type="search"
        id="blog-search-input"
        class="blog-search-input"
        placeholder="Search posts…"
        aria-label="Search posts"
      />
      ${tags.length ? `
      <select id="blog-tag-select" class="blog-tag-select" aria-label="Filter by tag">
        <option value="">All tags</option>
        ${tagOptions}
      </select>` : ""}
      <a class="blog-rss-link" href="/feed.xml" target="_blank" rel="noopener noreferrer" title="RSS feed">RSS</a>
    </div>
    <p class="blog-empty-filtered" id="blog-empty-filtered" hidden>No posts match your search or filters.</p>`;
}

function brandHtml(): string {
  return `
    <header class="blog-brand">
      <img class="blog-mark" src="/blog-mark.png" alt="" width="150" height="210" />
      <h2 class="blog-logo">
        <span class="blog-logo-main">let down</span>
        <span class="blog-logo-and">and</span>
        <span class="blog-logo-main blog-logo-main-2">hanging around</span>
      </h2>
    </header>`;
}

function aboutHtml(): string {
  const tags = getAllTags();
  const playing = isSpotifyPlayerOpen();
  return `
    <section class="blog-about" aria-label="About this blog">
      <p class="blog-about-text">
        <strong>let down and hanging around</strong> — a line from Radiohead's <em>Let Down</em>, borrowed
        for the stuff that gets stuck in my head long after I close the laptop. Expect competitive
        programming write-ups, some math I found interesting, and postmortems on things I've built
        (and occasionally broken)${tags.length ? ` — mostly ${tags.slice(0, 3).map((t) => t.toLowerCase()).join(", ")}` : ""}.
      </p>
      <button type="button" id="spotify-toggle-btn" class="blog-spotify-btn" aria-pressed="${playing ? "true" : "false"}">
        ${spotifyBtnHtml(playing)}
      </button>
    </section>`;
}

function pageHtml(): string {
  const body = BLOG_POSTS.length
    ? `<div class="blog-grid" id="blog-grid">${BLOG_POSTS.map(card).join("")}</div>`
    : `<p class="gl-empty">No posts published yet — check back soon.</p>`;
  return `
    <article class="page section-page blogs-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)} · Blog</span>
      </nav>
      <div class="section-body">
        ${brandHtml()}
        ${aboutHtml()}

        <h3 class="blog-section-label">featured</h3>
        ${controlsHtml()}
        ${body}

        <div class="blog-subscribe-wrap">
          ${SUBSCRIBE_FORM_HTML}
        </div>
      </div>
      ${SCROLL_TOP_BUTTON_HTML}
    </article>`;
}

function wireFilters(container: HTMLElement): void {
  const searchInput = container.querySelector<HTMLInputElement>("#blog-search-input");
  const tagSelect = container.querySelector<HTMLSelectElement>("#blog-tag-select");
  const cards = Array.from(container.querySelectorAll<HTMLElement>(".blog-card"));
  const emptyMsg = container.querySelector<HTMLElement>("#blog-empty-filtered");
  if (!cards.length) return;

  const apply = () => {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    const activeTag = tagSelect?.value ?? "";
    let visibleCount = 0;

    cards.forEach((card) => {
      const haystack = card.dataset.search ?? "";
      const cardTags = (card.dataset.tags ?? "").split("|").filter(Boolean);
      const matchesSearch = !query || haystack.includes(query);
      const matchesTags = !activeTag || cardTags.includes(activeTag);
      const visible = matchesSearch && matchesTags;
      card.style.display = visible ? "" : "none";
      if (visible) visibleCount += 1;
    });

    if (emptyMsg) emptyMsg.hidden = visibleCount > 0;
  };

  searchInput?.addEventListener("input", apply);
  tagSelect?.addEventListener("change", apply);
}

function spotifyBtnHtml(playing: boolean): string {
  return `<span class="blog-spotify-icon" aria-hidden="true">${playing ? "&#10073;&#10073;" : "&#9658;"}</span>
    ${playing ? "playing" : "play"} &ldquo;Let Down&rdquo; while you read`;
}

function wireSpotifyToggle(container: HTMLElement): void {
  const btn = container.querySelector<HTMLButtonElement>("#spotify-toggle-btn");
  btn?.addEventListener("click", () => {
    const playing = toggleSpotifyPlayer();
    btn.setAttribute("aria-pressed", playing ? "true" : "false");
    btn.innerHTML = spotifyBtnHtml(playing);
  });
}

export function mountBlogs(container: HTMLElement): void {
  container.innerHTML = pageHtml();
  initScrollTopButton(container);
  wireSubscribeForm(container);
  wireFilters(container);
  wireSpotifyToggle(container);
  mountBlogGraph();
}
