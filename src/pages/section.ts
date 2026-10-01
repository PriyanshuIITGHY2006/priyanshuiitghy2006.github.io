import type { ResumeData } from "../types";
import { resume } from "../data/resume";
import { loadResumeFromDB } from "../lib/supabase";
import { showLive } from "../lib/live-data";
import { loadCodeforces, rankName } from "../lib/codeforces";
import { renderSection, type SectionKey } from "../render/resume";

const TITLES: Record<SectionKey, string> = {
  education: "Education",
  projects: "Projects",
  skills: "Technical Skills",
  positions: "Positions of Responsibility",
  achievements: "Achievements",
};

function page(key: SectionKey, data: ResumeData): string {
  return `
    <article class="page section-page solo-section-page">
      <nav class="section-nav">
        <a class="section-back" href="/">← back</a>
        <span class="section-crumb">${data.name} · ${TITLES[key]}</span>
      </nav>
      <div class="section-body">
        ${renderSection(key, data)}
      </div>
    </article>`;
}

// Mount a standalone page for a single résumé section from live Supabase
// data (cached copy first), falling back to the bundled copy only if the DB
// is down.
export function mountSection(container: HTMLElement, key: SectionKey): void {
  showLive({
    key: "resume",
    fallback: resume,
    load: loadResumeFromDB,
    usable: (data) => data !== resume, // loader returns the static copy on error
    render: (data) => {
      container.innerHTML = page(key, data);
      if (key === "achievements") hydrateCodeforcesLine(container);
    },
  });
}

// The Achievements section embeds the live Codeforces line — keep it in sync.
function hydrateCodeforcesLine(scope: HTMLElement): void {
  const titleEl = scope.querySelector<HTMLElement>('[data-cf="title"]');
  const solvedEl = scope.querySelector<HTMLElement>('[data-cf="solved"]');
  if (!titleEl && !solvedEl) return;

  loadCodeforces()
    .then((data) => {
      if (titleEl && data.user.maxRating) {
        const rank = rankName(data.user.maxRating);
        titleEl.textContent = `Codeforces ${rank} (Max ${data.user.maxRating})`;
      }
      if (solvedEl && data.stats.solvedCount > 0) {
        const rounded = Math.floor(data.stats.solvedCount / 50) * 50;
        solvedEl.textContent = `${rounded}+`;
      }
    })
    .catch(() => {
      /* keep static text */
    });
}
