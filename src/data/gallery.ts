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
    id: "hackathon-squad",
    title: "Hackathon Squad — Priyanshu Debnath",
    // File uploaded with spaces in its name — URL-encode for the browser.
    src: "gallery/Priyanshu%20Debnath.Hackathon%20Squad.png",
    date: "Apr 2026",
    description: "Certificate of completion — Coding Club, IIT Guwahati.",
  },
];
