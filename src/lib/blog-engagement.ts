import { supabase } from "./supabase";

export interface BlogStats {
  views: number;
  likes: number;
}

export interface BlogComment {
  id: number;
  slug: string;
  name: string;
  message: string;
  approved: boolean;
  created_at: string;
}

// ─── Public: views & likes ──────────────────────────────────────────────────

export async function getBlogStats(slug: string): Promise<BlogStats> {
  const { data, error } = await supabase
    .from("blog_stats")
    .select("views, likes")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return { views: 0, likes: 0 };
  return { views: data.views ?? 0, likes: data.likes ?? 0 };
}

/** Fire-and-forget: counts one view for this post. */
export async function recordView(slug: string): Promise<void> {
  const { error } = await supabase.rpc("increment_blog_view", { p_slug: slug });
  if (error) console.warn("[blog] view increment failed", error.message);
}

/** Returns the new like count. Throws on failure so the caller can roll back UI state. */
export async function likePost(slug: string): Promise<number> {
  const { data, error } = await supabase.rpc("increment_blog_like", { p_slug: slug });
  if (error) throw error;
  return data as number;
}

// ─── Public: comments & subscribers ─────────────────────────────────────────
// Both go through the `blog-engage` edge function rather than calling their
// SECURITY DEFINER RPCs directly: the RPCs are no longer grantable to anon,
// because a direct RPC call bypasses the UI (and any client-side checks)
// entirely — anyone with the public anon key could otherwise script mass
// signups/comments. The edge function verifies a Turnstile token server-side
// before touching the database, using the service role to call the RPCs.

const ENGAGE_URL = "https://vadbagtnekrjwrimvgxe.supabase.co/functions/v1/blog-engage";

async function callEngage<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENGAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error || "Request failed");
  return data as T;
}

export async function getApprovedComments(slug: string): Promise<BlogComment[]> {
  const { data, error } = await supabase
    .from("blog_comments")
    .select("*")
    .eq("slug", slug)
    .eq("approved", true)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as BlogComment[]) ?? [];
}

/** Always inserted as unapproved — publishing requires admin review. */
export async function submitComment(slug: string, name: string, message: string, turnstileToken: string): Promise<void> {
  await callEngage({ action: "comment", slug, name, message, turnstileToken });
}

/**
 * Stores name + email for future new-post notification emails. A duplicate
 * email is treated as an already-subscribed success rather than an error.
 */
export async function subscribeToBlog(
  name: string,
  email: string,
  turnstileToken: string,
): Promise<{ alreadySubscribed: boolean }> {
  const data = await callEngage<{ alreadySubscribed: boolean }>({ action: "subscribe", name, email, turnstileToken });
  return { alreadySubscribed: data.alreadySubscribed ?? false };
}

// ─── Admin: moderation ───────────────────────────────────────────────────────

export async function getAllComments(): Promise<BlogComment[]> {
  const { data, error } = await supabase
    .from("blog_comments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as BlogComment[]) ?? [];
}

export async function setCommentApproved(id: number, approved: boolean): Promise<void> {
  const { error } = await supabase.from("blog_comments").update({ approved }).eq("id", id);
  if (error) throw error;
}

export async function deleteComment(id: number): Promise<void> {
  const { error } = await supabase.from("blog_comments").delete().eq("id", id);
  if (error) throw error;
}
