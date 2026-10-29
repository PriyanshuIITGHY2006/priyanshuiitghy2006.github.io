// Thin client for the github-publish edge function, the only place the
// admin reaches GitHub. supabase-js attaches the admin's session to
// functions.invoke, and the function checks is_admin() before doing anything.

import { supabase } from "./supabase";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB, plenty for certificates and covers

export const POSTS_DIR = "content/posts";

async function callGithubPublish<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("github-publish", { body });
  if (error) throw new Error(error.message || "GitHub publish failed.");
  if (data && typeof data === "object" && "error" in data && data.error) throw new Error(String(data.error));
  return data as T;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

/** Commits the file to static/gallery-media/; `src` is its site-relative path. */
export async function uploadFileToGithub(file: File): Promise<{ path: string; src: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large. Keep it under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
  }
  const contentBase64 = await fileToBase64(file);
  return callGithubPublish({ action: "upload_image", filename: file.name, contentBase64 });
}

export function publishPost(slug: string, content: string): Promise<{ path: string }> {
  return callGithubPublish({ action: "publish_blog_post", slug, content });
}

/** Commits latex/<slug>.tex; the "Compile blog PDFs" workflow does the rest. */
export function publishLatex(slug: string, content: string): Promise<{ path: string }> {
  return callGithubPublish({ action: "publish_latex", slug, content });
}

export function readPost(slug: string): Promise<{ exists: boolean; content: string }> {
  return callGithubPublish({ action: "read_file", path: `${POSTS_DIR}/${slug}.md` });
}

export function deletePost(slug: string): Promise<{ deleted: boolean }> {
  return callGithubPublish({ action: "delete_file", path: `${POSTS_DIR}/${slug}.md` });
}

export interface PostListing {
  slug: string;
  title: string;
  date: string;
}

export function listPosts(): Promise<{ posts: PostListing[] }> {
  return callGithubPublish({ action: "list_posts" });
}
