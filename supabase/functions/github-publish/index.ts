import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Admin-only bridge to the GitHub Contents API: commits gallery images to
// public/gallery-media/ and blog post markdown to src/data/blogs/, both on
// the branch the site's existing GitHub Actions workflow deploys from. A
// commit here triggers that same build+deploy pipeline — nothing else
// needs to know a publish happened.
//
// The image folder is "gallery-media", not "gallery" — the SPA has a real
// /gallery route, and GitHub Pages treats a public/gallery/ directory as a
// real path, which broke direct loads/refreshes of /gallery.
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
      const { path } = await putFile(`public/gallery-media/${safe}`, contentBase64, `Add gallery image: ${safe}`);
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
      const { path } = await putFile(`src/data/blogs/${slug}.md`, utf8ToBase64(content), `Publish blog post: ${slug}`);
      return json({ ok: true, path });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("github-publish error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
