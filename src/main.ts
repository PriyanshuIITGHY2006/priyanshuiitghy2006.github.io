import "./styles/resume.css";
import { resume } from "./data/resume";
import { renderResume } from "./render/resume";

// Every clickable element with a `data-detail` will eventually open a rich
// detail view (and pull content from Supabase). For now we let the native
// link navigate, but funnel the intent through one place.
function wireDetailClicks(): void {
  document.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-detail]");
    if (!target) return;
    const id = target.getAttribute("data-detail");
    // Phase 2 will intercept here (e.preventDefault) and open a detail panel.
    console.debug("[detail]", id);
  });
}

function mount(): void {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;

  const page = document.createElement("article");
  page.className = "page";
  page.id = "cv";
  page.innerHTML = renderResume(resume);
  app.appendChild(page);

  wireDetailClicks();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
