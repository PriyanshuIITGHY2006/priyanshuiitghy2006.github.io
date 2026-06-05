# Gallery images

Drop certificate scans, achievement screenshots, and project screenshots
into this folder, then register each one in `src/data/gallery.ts`.

- Use web-friendly formats: .jpg / .png / .webp
- Reference them as `gallery/<filename>` (this folder maps to the site root).
- Each entry's `id` becomes a shareable deep-link: `#/gallery?img=<id>`
