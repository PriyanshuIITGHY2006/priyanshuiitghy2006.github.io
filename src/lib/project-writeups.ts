// Long-form project write-ups published from admin (see admin-publish.ts's
// publishProjectWriteupToGithub), committed to src/data/project-writeups/.
// Unlike blog posts, these files carry no frontmatter — all metadata
// (title, tagline, links, ...) lives in the projects DB table; a file here
// is purely the write-up body, keyed by filename = project id.

const files = import.meta.glob("/src/data/project-writeups/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function idFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/, "");
}

const PROJECT_WRITEUPS: Record<string, string> = {};
for (const [path, raw] of Object.entries(files)) {
  PROJECT_WRITEUPS[idFromPath(path)] = raw.trim();
}

export function getProjectWriteup(id: string): string | undefined {
  return PROJECT_WRITEUPS[id];
}
