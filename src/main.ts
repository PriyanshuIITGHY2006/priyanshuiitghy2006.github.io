// The public site is the Hugo build in hugo-site/. This app only serves /admin
// and the /gallery credential viewer. The other old pages are not routed (their
// code is still in the repo, just not bundled). Old blog links forward to the
// matching Hugo post and every other unknown path goes to the home page.

import "./styles/resume.css";
import "./styles/about.css";
import { mountAdmin } from "./pages/admin";
import { mountGallery } from "./pages/gallery";
import { route, start, notFound } from "./lib/router";
import { mountThemeToggle } from "./lib/theme";
import { setPageMeta } from "./lib/seo";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app");

const themeToggleBtn = document.querySelector<HTMLButtonElement>("#theme-toggle");
if (themeToggleBtn) mountThemeToggle(themeToggleBtn);

route("/admin", () => {
  setPageMeta({ title: "Admin", noindex: true });
  app.innerHTML = "";
  mountAdmin(app);
});

// Credential links (/gallery?img=<id>) are shared around, so they keep working.
route("/gallery", (params) => {
  setPageMeta({ title: "Gallery" });
  app.innerHTML = "";
  mountGallery(app, params.get("img"));
});

route("/blogs", () => {
  location.replace("/posts/");
});
route("/blog", (params) => {
  const slug = params.get("slug");
  location.replace(slug ? `/posts/${encodeURIComponent(slug)}/` : "/posts/");
});

notFound(() => {
  location.replace("/");
});

start();
