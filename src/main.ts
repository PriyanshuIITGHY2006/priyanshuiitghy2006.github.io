import "./styles/resume.css";
import "./styles/codeforces.css";
import { resume } from "./data/resume";
import { renderResume } from "./render/resume";
import { mountCodeforces } from "./pages/codeforces";
import { loadCodeforces, rankName } from "./lib/codeforces";
import { route, start } from "./lib/router";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app");

// Every clickable element with a `data-detail` will eventually open a rich
// detail view (and pull content from Supabase). For now we let the native
// link navigate, but funnel the intent through one place so we can add
// future per-detail handlers easily.
document.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("[data-detail]");
  if (!target) return;
  console.debug("[detail]", target.getAttribute("data-detail"));
});

// ─── Home (résumé) ──────────────────────────────────────────────────────
route("/", () => {
  app.innerHTML = "";
  const page = document.createElement("article");
  page.className = "page";
  page.id = "cv";
  page.innerHTML = renderResume(resume);
  app.appendChild(page);
  hydrateCodeforcesLine(page);
});

// ─── Codeforces detail ──────────────────────────────────────────────────
route("/codeforces", () => {
  // Use the full page (no .page container) for the dashboard-style layout.
  app.innerHTML = "";
  void mountCodeforces(app);
});

start();

// ─── Live update of the Codeforces line on the résumé ───────────────────
// The static text in resume.ts says "Specialist (Max 1473) … 250+ problems
// solved". We replace the rank/rating and the solved count with live data
// once it's fetched. Silent on failure — the static text remains.
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
        // Round down to the nearest 50 so the line reads as a steady claim
        // rather than a fluctuating exact count.
        const rounded = Math.floor(data.stats.solvedCount / 50) * 50;
        solvedEl.textContent = `${rounded}+`;
      }
    })
    .catch(() => {
      /* network/CORS issue → keep the static text untouched */
    });
}
