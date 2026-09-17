// ─── Gallery: certificates, screenshots & PDFs ───────────────────────
// Drop image OR PDF files into  public/gallery-media/  and add an entry here.
// (Named "gallery-media", not "gallery" — the SPA has a real /gallery route,
// and GitHub Pages treats a public/gallery/ directory as a real path, which
// broke direct loads/refreshes of /gallery.)
//
//   • `id`  is a stable slug — it becomes a shareable deep-link that opens
//          the file full-screen:  /gallery?img=<id>
//   • `src` is the file path, e.g. "gallery-media/award.png" or
//          "gallery-media/cert.pdf". The type is detected from the
//          extension: .pdf renders in an inline PDF viewer, everything else
//          renders as an image.
//
// Only list files that actually exist — there are no placeholders. This is
// now just an offline fallback — the live source of truth is the
// site_images table (see src/lib/supabase.ts's loadGalleryFromDB), edited
// from the admin panel's Images tab.

export interface GalleryItem {
  id: string;
  title: string;
  src: string;
  date?: string;
  description?: string;
}

export const GALLERY: GalleryItem[] = [
  {
    id: "quantfest-26",
    title: "Quantfest 2026 — Priyanshu Debnath",
    src: "gallery-media/Quantfest26.pdf",
    date: "Aug 2026",
    description: "Certificate of AIR 51 in Quantfest 2026 Prelims",
  },
  {
    id: "kriti-2026",
    title: "Kriti 2026 — Gold Medal (AI Challenge)",
    src: "gallery-media/kriti.pdf",
    date: "2026",
    description: "Certificate of Achievement — Technical Board, Students' Gymkhana, IIT Guwahati.",
  },
  {
    id: "ams-derive-2026",
    title: "AMS Derive 2026 — PRIOR Round, Rank 199",
    src: "gallery-media/ams-derive.pdf",
    date: "2026",
    description: "Official PRIOR Round rank — Algorithms & Mathematics Society (partners: Jane Street, QRT).",
  },
  {
    id: "hackathon-squad",
    title: "Hackathon Squad — Priyanshu Debnath",
    // File uploaded with spaces in its name — URL-encode for the browser.
    src: "gallery-media/Priyanshu%20Debnath.Hackathon%20Squad.png",
    date: "Apr 2026",
    description: "Certificate of completion — Coding Club, IIT Guwahati.",
  },
  {
    id: "kelly-criterion",
    title: "Kelly-Criterion — Priyanshu Debnath",
    // File uploaded with spaces in its name — URL-encode for the browser.
    src: "gallery-media/kelly-criterion.pdf",
    date: "Apr 2026",
    description: "Detailed work on kelly criterion for fixed bet games",
  },
  {
    id: "delta-2026-tech",
    title: "IICPC DELTA 2026 — Technology Track",
    // Parentheses are valid in URL paths but encode to be safe.
    src: "gallery-media/IICPC-DELTA%28TECH%29.pdf",
    date: "Aug 2026",
    description: "Technology track result — IICPC DELTA 2026 (Optiver · HRT).",
  },
  {
    id: "delta-2026-trading",
    title: "IICPC DELTA 2026 — Trading Track",
    src: "gallery-media/IICPC-DELTA%28TRADING%29.pdf",
    date: "Aug 2026",
    description: "Trading track result — IICPC DELTA 2026 (Optiver · HRT).",
  },
];
