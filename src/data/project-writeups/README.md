# src/data/project-writeups/

Long-form project deep-dives, one file per project: `<project-id>.md`.

Unlike `src/data/blogs/*.md`, these files carry **no frontmatter** — every
other field (title, date, stack, tagline, highlights, links, ...) lives in
the `projects` table in Supabase, edited from the admin panel. A file here
is purely the write-up body, rendered through the same markdown pipeline
as blog posts (`src/lib/blog.ts`).

Published from the admin panel's Projects tab ("Publish write-up to
GitHub"), which commits here via the `github-publish` edge function. A
project only gets a "Full write-up →" link and a `/project?id=<id>` page
once a matching file exists here — deleting the file (or never publishing
one) is how a project stays list-only.
