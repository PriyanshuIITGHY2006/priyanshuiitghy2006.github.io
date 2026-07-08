// Per-page <title> / meta description / Open Graph overrides. index.html
// ships sane site-wide defaults (see the <head> there); this just patches
// them per route so a shared link, a browser tab, or a bookmark reflects
// the actual page instead of always saying "Priyanshu Debnath — Résumé".
//
// Crawlers that don't execute JS (most social-media unfurlers) never see
// these updates — that's what scripts/generate-seo.mjs's static per-post/
// per-project preview pages are for. This is purely for real browsers.

const SITE_NAME = "Priyanshu Debnath";
const DEFAULT_DESCRIPTION =
  "Priyanshu Debnath — B.Tech EEE, IIT Guwahati. Interactive résumé: ML research, quantitative finance, competitive programming.";

function setMetaByName(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export interface PageMeta {
  /** Page-specific title. Rendered as "<title> — Priyanshu Debnath", unless `bare` is set. */
  title: string;
  /** Use the title exactly as given, with no " — Priyanshu Debnath" suffix. */
  bare?: boolean;
  description?: string;
  image?: string;
  type?: "website" | "article";
  /** Admin/private pages only — keeps them out of search results. */
  noindex?: boolean;
}

/** Call on every route change — resets anything a previous page overrode. */
export function setPageMeta(meta: PageMeta): void {
  document.title = meta.bare ? meta.title : `${meta.title} — ${SITE_NAME}`;

  const description = meta.description || DEFAULT_DESCRIPTION;
  setMetaByName("description", description);
  setMetaByName("robots", meta.noindex ? "noindex, nofollow" : "index, follow");
  setMetaByProperty("og:title", document.title);
  setMetaByProperty("og:description", description);
  setMetaByProperty("og:type", meta.type ?? "website");
  setMetaByProperty("og:url", location.href);
  setMetaByName("twitter:title", document.title);
  setMetaByName("twitter:description", description);

  const image = meta.image || `${location.origin}/profile.jpg`;
  setMetaByProperty("og:image", image);
  setMetaByName("twitter:image", image);
}
