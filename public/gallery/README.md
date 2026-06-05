# Gallery files

Drop certificate scans, achievement screenshots, and project PDFs into this
folder, then register each one in `src/data/gallery.ts`.

- Images: .jpg / .png / .webp  → rendered full-screen.
- PDFs:   .pdf                 → rendered inline in the browser's PDF viewer.
- Reference them as `gallery/<filename>` (this folder maps to the site root).
- Each entry's `id` is a shareable deep-link: `#/gallery?img=<id>`
- Only list files that exist — there are no placeholders.
