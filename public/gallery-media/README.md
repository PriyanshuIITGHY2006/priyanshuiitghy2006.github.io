# Gallery files

Drop certificate scans, achievement screenshots, and project PDFs into this
folder, then register each one in `src/data/gallery.ts` (offline fallback)
or upload directly from the admin panel's Images tab (writes to this same
folder via GitHub, plus the live `site_images` table).

- Images: .jpg / .png / .webp  → rendered full-screen.
- PDFs:   .pdf                 → rendered inline in the browser's PDF viewer.
- Reference them as `gallery-media/<filename>` (this folder maps to the site root).
- Each entry's `id` is a shareable deep-link: `/gallery?img=<id>`
- Only list files that exist — there are no placeholders.

Named `gallery-media` rather than `gallery` deliberately — the SPA has a
real `/gallery` route, and GitHub Pages treats any `public/gallery/`
directory as a real path, which broke direct loads/refreshes of `/gallery`
(it 404'd via a server-side redirect to `/gallery/`, which no client route
matches).
