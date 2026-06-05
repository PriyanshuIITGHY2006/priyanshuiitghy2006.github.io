// ─── Gallery: certificates, achievement & project screenshots ─────────
// Drop image files into  public/gallery/  and add an entry here.
//
//   • `id`  is a stable slug — it becomes a shareable deep-link that opens
//          the image full-screen:  #/gallery?img=<id>
//   • `src` is the image path, e.g. "gallery/jee-advanced.jpg"
//          (the public/ folder maps to the site root).
//
// Missing files render a tasteful "awaiting upload" placeholder, so you can
// register an entry first and upload the image later.

export type GalleryCategory =
  | "Certificates & Achievements"
  | "Project Screenshots";

export interface GalleryItem {
  id: string;
  title: string;
  category: GalleryCategory;
  src: string;
  date?: string;
  description?: string;
}

// Order in which categories are shown on the page.
export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "Certificates & Achievements",
  "Project Screenshots",
];

export const GALLERY: GalleryItem[] = [
  {
    id: "jee-advanced-2025",
    title: "JEE Advanced 2025 — All India Rank 1941",
    category: "Certificates & Achievements",
    src: "gallery/jee-advanced-2025.jpg",
    date: "2025",
    description:
      "Top 1% among 1.5 lakh+ candidates — scorecard / rank certificate.",
  },
  {
    id: "jee-main-2025",
    title: "JEE Main 2025 — 99.69 Percentile",
    category: "Certificates & Achievements",
    src: "gallery/jee-main-2025.jpg",
    date: "2025",
    description: "All India Rank 4738 — NTA scorecard.",
  },
  {
    id: "codeforces-specialist",
    title: "Codeforces — Specialist",
    category: "Certificates & Achievements",
    src: "gallery/codeforces-specialist.png",
    date: "2025–Present",
    description: "Competitive programming rating milestone.",
  },
  {
    id: "codechef-2star",
    title: "CodeChef — 2 Star",
    category: "Certificates & Achievements",
    src: "gallery/codechef-2star.png",
    date: "2025–Present",
    description: "CodeChef rating profile.",
  },
];
