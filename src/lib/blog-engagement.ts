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
    .insert({ slug, name, message, approved: false });
  if (error) throw error;
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
