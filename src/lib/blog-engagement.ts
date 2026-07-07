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

/** Always inserted as unapproved — publishing requires admin review. */
export async function submitComment(slug: string, name: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("blog_comments")
    .insert({ slug, name, message, approved: false })
    // The anon SELECT policy only allows approved=true rows, but a fresh
    // comment is always approved=false — asking PostgREST to hand it back
    // would hit that same RLS gate and 403 the insert. Skip it.
    .setHeader("Prefer", "return=minimal");
  if (error) throw error;
}

// ─── Public: subscribers ─────────────────────────────────────────────────────

/**
 * Stores name + email for future new-post notification emails (sent manually
 * or via a separate automation later — this just captures the signup).
 * A duplicate email (unique constraint on `email`) is treated as an
 * already-subscribed success rather than an error.
 */
export async function subscribeToBlog(name: string, email: string): Promise<{ alreadySubscribed: boolean }> {
  const { error } = await supabase
    .from("blog_subscribers")
    .insert({ name, email: email.toLowerCase().trim() })
    // There's no anon SELECT policy on this table (subscriber emails aren't
    // publicly readable), so skip asking PostgREST to hand the row back —
    // otherwise it evaluates that same RLS-gated read and 403s the insert.
    .setHeader("Prefer", "return=minimal");

  if (error) {
    // Postgres unique_violation
    if (error.code === "23505") return { alreadySubscribed: true };
    throw error;
  }
  return { alreadySubscribed: false };
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
