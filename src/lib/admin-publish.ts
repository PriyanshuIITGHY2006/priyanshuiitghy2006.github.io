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

async function readFileFromGithub(path: string): Promise<{ exists: boolean; content: string }> {
  return callGithubPublish<{ exists: boolean; content: string }>({ action: "read_file", path });
}

async function deleteFileFromGithub(path: string): Promise<{ deleted: boolean }> {
  return callGithubPublish<{ deleted: boolean }>({ action: "delete_file", path });
}

export function readProjectWriteupFromGithub(id: string): Promise<{ exists: boolean; content: string }> {
  return readFileFromGithub(`src/data/project-writeups/${id}.md`);
}

export function deleteProjectWriteupFromGithub(id: string): Promise<{ deleted: boolean }> {
  return deleteFileFromGithub(`src/data/project-writeups/${id}.md`);
}

export function readBlogPostFromGithub(slug: string): Promise<{ exists: boolean; content: string }> {
  return readFileFromGithub(`src/data/blogs/${slug}.md`);
}

export function deleteBlogPostFromGithub(slug: string): Promise<{ deleted: boolean }> {
  return deleteFileFromGithub(`src/data/blogs/${slug}.md`);
}

export function listBlogSlugsFromGithub(): Promise<{ files: string[] }> {
  return callGithubPublish<{ files: string[] }>({ action: "list_directory", dir: "src/data/blogs" });
}

// ── Email campaigns: thin client for the email-campaign edge function ──────
// Draft CRUD (list/save/delete) happens directly through supabase-js from
// the admin panel — RLS already gates that on is_admin(). Only the actual
// Brevo send needs an edge function, since that alone requires the
// BREVO_API_KEY secret held server-side.
async function callEmailCampaign<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("email-campaign", { body });
  if (error) throw new Error(error.message || "Email send failed.");
  const result = data as (T & Partial<PublishErrorBody>) | PublishErrorBody;
  if (result && "error" in result && result.error) throw new Error(result.error);
  return data as T;
}

export interface CampaignAttachment {
  name: string;
  bucket: string;
  path: string;
  size: number;
}

export function sendTestCampaignEmail(fields: {
  subject: string;
  preheader: string;
  bodyMarkdown: string;
  testEmail: string;
  senderName?: string;
  senderEmail?: string;
  attachments?: CampaignAttachment[];
}): Promise<{ ok: true }> {
  return callEmailCampaign<{ ok: true }>({ action: "send_test", ...fields });
}

export function sendCampaignToAllSubscribers(campaignId: string): Promise<{ ok: true; sent: number; failed: number; total: number }> {
  return callEmailCampaign<{ ok: true; sent: number; failed: number; total: number }>({ action: "send_campaign", campaignId });
}
