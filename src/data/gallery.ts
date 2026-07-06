// ─── Gallery: certificates, screenshots & PDFs ───────────────────────
// Drop image OR PDF files into  public/gallery/  and add an entry here.
//
//   • `id`  is a stable slug — it becomes a shareable deep-link that opens
//          the file full-screen:  #/gallery?img=<id>
//   • `src` is the file path, e.g. "gallery/award.png" or "gallery/cert.pdf".
//          The type is detected from the extension: .pdf renders in an inline
//          PDF viewer, everything else renders as an image.
//
// Only list files that actually exist — there are no placeholders.

export interface GalleryItem {
  id: string;
  title: string;
  src: string;
  date?: string;
  description?: string;
}

export const GALLERY: GalleryItem[] = [
  {
    id: "kriti-2026",
    title: "Kriti 2026 — Gold Medal (AI Challenge)",
    src: "gallery/kriti.pdf",
    date: "2026",
    description: "Certificate of Achievement — Technical Board, Students' Gymkhana, IIT Guwahati.",
  },
  {
    id: "ams-derive-2026",
    title: "AMS Derive 2026 — PRIOR Round, Rank 199",
    src: "gallery/ams-derive.pdf",
    date: "2026",
    description: "Official PRIOR Round rank — Algorithms & Mathematics Society (partners: Jane Street, QRT).",
  },
  {
    id: "hackathon-squad",
    title: "Hackathon Squad — Priyanshu Debnath",
    // File uploaded with spaces in its name — URL-encode for the browser.
    src: "gallery/Priyanshu%20Debnath.Hackathon%20Squad.png",
    date: "Apr 2026",
    description: "Certificate of completion — Coding Club, IIT Guwahati.",
  },
  {
    id: "kelly-criterion",
    title: "Kelly-Criterion — Priyanshu Debnath",
    // File uploaded with spaces in its name — URL-encode for the browser.
    src: "gallery/kelly-criterion.pdf",
    date: "Apr 2026",
    description: "Detailed work on kelly criterion for fixed bet games",
  }
];
