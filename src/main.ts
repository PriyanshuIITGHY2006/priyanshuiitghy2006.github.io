import "./styles/resume.css";
import "./styles/codeforces.css";
import { resume } from "./data/resume";
import { renderResume } from "./render/resume";
import { mountCodeforces } from "./pages/codeforces";
import { mountAdmin } from "./pages/admin";
import { mountSection } from "./pages/section";
import { mountEducation } from "./pages/education";
import { mountProjects } from "./pages/projects";
import { mountGallery } from "./pages/gallery";
import { mountAchievements } from "./pages/achievements";
import { loadCodeforces, rankName } from "./lib/codeforces";
import { loadResumeFromDB } from "./lib/supabase";
import { route, start } from "./lib/router";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app");

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

  // Render static resume immediately — no blank flash while DB loads
  page.innerHTML = renderResume(resume);
  app.appendChild(page);
  hydrateCodeforcesLine(page);

  // Fetch live data from Supabase and re-render
  loadResumeFromDB()
    .then((live) => {
      page.innerHTML = renderResume(live);
      hydrateCodeforcesLine(page);
    })
    .catch(() => {
      // DB unreachable — static version already shown
    });
});

// ─── Section detail pages (one per résumé heading) ──────────────────────
route("/education", () => {
  app.innerHTML = "";
  mountEducation(app);
});
route("/projects", () => {
  app.innerHTML = "";
  mountProjects(app);
});
route("/gallery", (params) => {
  app.innerHTML = "";
  mountGallery(app, params.get("img"));
});
route("/skills", () => {
  app.innerHTML = "";
  mountSection(app, "skills");
});
route("/positions", () => {
  app.innerHTML = "";
  mountSection(app, "positions");
});
route("/achievements", () => {
  app.innerHTML = "";
  mountAchievements(app);
});

// ─── Codeforces detail ──────────────────────────────────────────────────
route("/codeforces", () => {
  app.innerHTML = "";
  void mountCodeforces(app);
});

// ─── Admin panel ────────────────────────────────────────────────────────
route("/admin", () => {
  app.innerHTML = "";
  mountAdmin(app);
});

start();

// ─── Live update of the Codeforces line on the résumé ───────────────────
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
