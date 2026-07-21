import type { ResumeData } from "../types";
import { resume } from "../data/resume";
import { loadResumeFromDB } from "../lib/supabase";
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
    <article class="page section-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back</a>
        <span class="section-crumb">${data.name} · ${TITLES[key]}</span>
      </nav>
      <div class="section-body">
        ${renderSection(key, data)}
      </div>
    </article>`;
}

// Mount a standalone page for a single résumé section. Renders the static
// copy immediately, then swaps in live Supabase data exactly like the home
// page does — so there is never a blank flash while the DB loads.
export function mountSection(container: HTMLElement, key: SectionKey): void {
  container.innerHTML = page(key, resume);
  if (key === "achievements") hydrateCodeforcesLine(container);

  loadResumeFromDB()
    .then((live) => {
      container.innerHTML = page(key, live);
      if (key === "achievements") hydrateCodeforcesLine(container);
    })
    .catch(() => {
      /* DB unreachable — static version already shown */
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
