import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Admin-only bridge to the GitHub Contents API: commits uploads to
// static/gallery-media/, posts to content/posts/ and LaTeX sources to
// latex/, all on the branch the deploy workflow builds from. A commit here
// triggers that same build and deploy, so nothing else needs to know a
// publish happened.
//
// The upload folder is "gallery-media", not "gallery", because /gallery is
// a page on the site.
const GITHUB_OWNER = "PriyanshuIITGHY2006";
const GITHUB_REPO = "priyanshuiitghy2006.github.io";
const GITHUB_BRANCH = "Website";
const GITHUB_API = "https://api.github.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://priyanshudebnath.me",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Reuses the same is_admin() check the DB's own RLS policies use, run
// under the caller's own JWT — so this never has to duplicate or hardcode
// which user counts as admin.
async function isCallerAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("is_admin check failed", error);
    return false;
  }
  return data === true;
}

function repoContentsUrl(repoPath: string, query = ""): string {
  const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
  return `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}${query}`;
}

async function githubFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) throw new Error("GITHUB_TOKEN is not configured on this project.");
  return fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
}

async function getFileSha(repoPath: string): Promise<string | null> {
  const res = await githubFetch(repoContentsUrl(repoPath, `?ref=${GITHUB_BRANCH}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read of ${repoPath} failed (${res.status})`);
  const data = await res.json();
  return typeof data.sha === "string" ? data.sha : null;
}

// Creates the file, or updates it in place if it already exists (GitHub's
// Contents API requires the current blob SHA for an update).
async function putFile(repoPath: string, contentBase64: string, message: string): Promise<{ path: string }> {
  const sha = await getFileSha(repoPath);
  const res = await githubFetch(repoContentsUrl(repoPath), {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub write to ${repoPath} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return { path: repoPath };
}

function safeFilename(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned || `file-${Date.now()}`;
}

function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function base64ToUtf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

// read_file / delete_file only ever touch content this function itself
// manages — never an arbitrary repo path.
const POSTS_DIR = "content/posts";
function isReadableDeletablePath(path: string): boolean {
  return /^content\/posts\/[a-z0-9-]+\.md$/.test(path);
}

async function readFile(path: string): Promise<string | null> {
  const res = await githubFetch(repoContentsUrl(path, `?ref=${GITHUB_BRANCH}`));
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub read of ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return typeof data.content === "string" ? base64ToUtf8(data.content) : "";
}

// Title and date from a post's front matter, for the admin's post list.
function frontMatterValue(file: string, key: string): string {
  const fm = file.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const raw = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
  if (raw.startsWith('"')) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  return raw.replace(/^'(.*)'$/, "$1");
}

// Moves static/gallery-media/<from> to static/gallery-media/<to> in one
// commit, and rewrites every post that links to the old name in that same
// commit, so the site never builds with a broken link.
async function renameMedia(fromSrc: string, toName: string): Promise<{ src: string; updatedPosts: string[] }> {
  const fromName = decodeURIComponent(fromSrc.replace(/^gallery-media\//, ""));
  // Keep the old extension when the new name has none.
  if (!/\.[A-Za-z0-9]+$/.test(toName)) toName += fromName.match(/\.[A-Za-z0-9]+$/)?.[0] ?? "";
  const fromPath = `static/gallery-media/${fromName}`;
  const toPath = `static/gallery-media/${toName}`;
  const toSrc = `gallery-media/${encodeURIComponent(toName)}`;
  if (fromPath === toPath) throw new Error("The new name is the same as the old one.");

  const blobSha = await getFileSha(fromPath);
  if (!blobSha) throw new Error(`${fromPath} does not exist.`);
  if (await getFileSha(toPath)) throw new Error(`A file named ${toName} already exists.`);

  const api = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git`;
  const getJson = async (url: string, init?: RequestInit) => {
    const res = await githubFetch(url, init);
    if (!res.ok) throw new Error(`GitHub ${init?.method ?? "GET"} ${url.replace(api, "")} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };

  // Posts that mention the old path, written either way it can appear.
  const oldForms = [...new Set([`gallery-media/${fromName}`, `gallery-media/${encodeURIComponent(fromName)}`, fromSrc])];
  const listing = await githubFetch(repoContentsUrl(POSTS_DIR, `?ref=${GITHUB_BRANCH}`));
  const files: { name: string; type: string }[] = listing.ok ? await listing.json() : [];
  const postChanges: { path: string; content: string }[] = [];
  for (const f of files) {
    if (f.type !== "file" || !f.name.endsWith(".md")) continue;
    const path = `${POSTS_DIR}/${f.name}`;
    const text = (await readFile(path)) ?? "";
    let updated = text;
    for (const old of oldForms) updated = updated.split(old).join(toSrc);
    if (updated !== text) postChanges.push({ path, content: updated });
  }

  const head = await getJson(`${api}/ref/heads/${GITHUB_BRANCH}`);
  const headSha: string = head.object.sha;
  const headCommit = await getJson(`${api}/commits/${headSha}`);
  const tree = await getJson(`${api}/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: [
        { path: toPath, mode: "100644", type: "blob", sha: blobSha },
        { path: fromPath, mode: "100644", type: "blob", sha: null },
        ...postChanges.map((p) => ({ path: p.path, mode: "100644", type: "blob", content: p.content })),
      ],
    }),
  });
  const commit = await getJson(`${api}/commits`, {
    method: "POST",
    body: JSON.stringify({ message: `Rename ${fromName} to ${toName}`, tree: tree.sha, parents: [headSha] }),
  });
  await getJson(`${api}/refs/heads/${GITHUB_BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  return { src: toSrc, updatedPosts: postChanges.map((p) => p.path) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!(await isCallerAdmin(req))) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const body = await req.json();

    if (body.action === "upload_image") {
      const filename: unknown = body.filename;
      const contentBase64: unknown = body.contentBase64;
      if (typeof filename !== "string" || typeof contentBase64 !== "string" || !filename || !contentBase64) {
        return json({ error: "filename and contentBase64 are required" }, 400);
      }
      const safe = safeFilename(filename);
      const { path } = await putFile(`static/gallery-media/${safe}`, contentBase64, `Add gallery image: ${safe}`);
      return json({ ok: true, path, src: `gallery-media/${encodeURIComponent(safe)}` });
    }

    if (body.action === "publish_blog_post") {
      const slug: unknown = body.slug;
      const content: unknown = body.content;
      if (typeof slug !== "string" || typeof content !== "string" || !slug || !content) {
        return json({ error: "slug and content are required" }, 400);
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return json({ error: "slug must contain only lowercase letters, digits, and hyphens" }, 400);
      }
      const { path } = await putFile(`${POSTS_DIR}/${slug}.md`, utf8ToBase64(content), `Publish blog post: ${slug}`);
      return json({ ok: true, path });
    }

    // Blog post LaTeX source. The "Compile blog PDFs" workflow picks up any
    // change under latex/, compiles it with TeX Live and commits the PDF.
    if (body.action === "publish_latex") {
      const slug: unknown = body.slug;
      const content: unknown = body.content;
      if (typeof slug !== "string" || typeof content !== "string" || !slug || !content) {
        return json({ error: "slug and content are required" }, 400);
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return json({ error: "slug must contain only lowercase letters, digits, and hyphens" }, 400);
      }
      if (content.length > 2_000_000) {
        return json({ error: "LaTeX source is too large" }, 400);
      }
      const { path } = await putFile(`latex/${slug}.tex`, utf8ToBase64(content), `Compile PDF for blog post: ${slug}`);
      return json({ ok: true, path });
    }

    if (body.action === "read_file") {
      const path: unknown = body.path;
      if (typeof path !== "string" || !isReadableDeletablePath(path)) {
        return json({ error: "Invalid or disallowed path" }, 400);
      }
      const content = await readFile(path);
      return json({ ok: true, exists: content !== null, content: content ?? "" });
    }

    if (body.action === "list_posts") {
      const res = await githubFetch(repoContentsUrl(POSTS_DIR, `?ref=${GITHUB_BRANCH}`));
      if (res.status === 404) return json({ ok: true, posts: [] });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return json({ error: `GitHub list of ${POSTS_DIR} failed (${res.status}): ${text.slice(0, 300)}` }, 502);
      }
      const data = await res.json();
      const slugs: string[] = Array.isArray(data)
        ? data
            .filter((f: { type?: string; name?: string }) => f.type === "file" && typeof f.name === "string" && /^[a-z0-9-]+\.md$/.test(f.name))
            .map((f: { name: string }) => f.name.replace(/\.md$/, ""))
        : [];
      const posts = await Promise.all(slugs.map(async (slug) => {
        const file = (await readFile(`${POSTS_DIR}/${slug}.md`)) ?? "";
        return { slug, title: frontMatterValue(file, "title"), date: frontMatterValue(file, "date") };
      }));
      return json({ ok: true, posts });
    }

    if (body.action === "rename_media") {
      const from: unknown = body.from;
      const to: unknown = body.to;
      if (typeof from !== "string" || !/^gallery-media\/[^/]+$/.test(from) || typeof to !== "string" || !to.trim()) {
        return json({ error: "from (gallery-media/<file>) and to (new file name) are required" }, 400);
      }
      const result = await renameMedia(from, safeFilename(to));
      return json({ ok: true, ...result });
    }

    if (body.action === "delete_file") {
      const path: unknown = body.path;
      if (typeof path !== "string" || !isReadableDeletablePath(path)) {
        return json({ error: "Invalid or disallowed path" }, 400);
      }
      const sha = await getFileSha(path);
      if (!sha) {
        return json({ ok: true, deleted: false });
      }
      const res = await githubFetch(repoContentsUrl(path), {
        method: "DELETE",
        body: JSON.stringify({ message: `Delete ${path}`, sha, branch: GITHUB_BRANCH }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GitHub delete of ${path} failed (${res.status}): ${text.slice(0, 300)}`);
      }
      return json({ ok: true, deleted: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("github-publish error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
