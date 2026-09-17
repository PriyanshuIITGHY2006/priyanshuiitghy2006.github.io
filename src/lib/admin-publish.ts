// Thin client for the github-publish edge function — the only place admin
// actions reach out to GitHub (image uploads, blog post commits). Both
// calls reuse the admin's own logged-in Supabase session automatically
// (supabase-js attaches it to functions.invoke), which the function checks
// against is_admin() before touching GitHub at all.

import { supabase } from "./supabase";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — plenty for certificates/covers

interface PublishErrorBody {
  error: string;
}

async function callGithubPublish<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("github-publish", { body });
  if (error) throw new Error(error.message || "GitHub publish failed.");
  const result = data as (T & Partial<PublishErrorBody>) | PublishErrorBody;
  if (result && "error" in result && result.error) throw new Error(result.error);
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

export async function uploadImageToGithub(file: File): Promise<{ path: string; src: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large — keep it under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
  }
  const contentBase64 = await fileToBase64(file);
  return callGithubPublish<{ path: string; src: string }>({
    action: "upload_image",
    filename: file.name,
    contentBase64,
  });
}

export async function publishBlogPostToGithub(slug: string, content: string): Promise<{ path: string }> {
  return callGithubPublish<{ path: string }>({ action: "publish_blog_post", slug, content });
}

export async function publishProjectWriteupToGithub(id: string, content: string): Promise<{ path: string }> {
  return callGithubPublish<{ path: string }>({ action: "publish_project_writeup", id, content });
}
