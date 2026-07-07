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

// ─── Public: comments ────────────────────────────────────────────────────────

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

/**
 * Always inserted as unapproved — publishing requires admin review.
 *
 * Goes through an RPC (SECURITY DEFINER function) rather than a direct table
 * insert: the anon SELECT policy only allows approved=true rows, but a fresh
 * comment is always approved=false, and PostgREST insisted on evaluating
 * that RLS-gated read-back regardless of Prefer headers, 403ing the insert.
 * The function runs as its owner, which bypasses RLS entirely.
 */
export async function submitComment(slug: string, name: string, message: string): Promise<void> {
  const { error } = await supabase.rpc("submit_blog_comment", {
    p_slug: slug,
    p_name: name,
    p_message: message,
  });
  if (error) throw error;
}

// ─── Public: subscribers ─────────────────────────────────────────────────────

/**
 * Stores name + email for future new-post notification emails (sent manually
 * or via a separate automation later — this just captures the signup).
 * A duplicate email is treated as an already-subscribed success rather than
 * an error (handled inside the RPC itself, which catches unique_violation).
 *
 * Goes through an RPC (SECURITY DEFINER function) rather than a direct table
 * insert: there's no anon SELECT policy on this table (subscriber emails
 * aren't publicly readable), and PostgREST insisted on evaluating that
 * RLS-gated read-back regardless of Prefer headers, 403ing the insert. The
 * function runs as its owner, which bypasses RLS entirely.
 */
export async function subscribeToBlog(name: string, email: string): Promise<{ alreadySubscribed: boolean }> {
  const { data, error } = await supabase
    .rpc("subscribe_to_blog", { p_name: name, p_email: email })
    .single();

  if (error) throw error;
  return { alreadySubscribed: (data as { already_subscribed: boolean } | null)?.already_subscribed ?? false };
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
