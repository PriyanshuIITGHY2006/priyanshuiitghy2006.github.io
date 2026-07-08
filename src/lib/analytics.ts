// Privacy-respecting pageview counter — one row per route path in the
// `page_views` table, incremented via a SECURITY DEFINER RPC (mirrors the
// existing blog_stats / increment_blog_view pattern exactly). No IP
// address, user agent, cookie, or fingerprint is ever stored — just a
// running count per path.

import { supabase } from "./supabase";

/** Fire-and-forget: counts one view for this route path. */
export function trackPageView(path: string): void {
  void supabase.rpc("increment_page_view", { p_path: path }).then(({ error }) => {
    if (error) console.warn("[analytics] view increment failed", error.message);
  });
}

export interface PageViewRow {
  path: string;
  views: number;
}

export async function getPageViews(): Promise<PageViewRow[]> {
  const { data, error } = await supabase.from("page_views").select("*").order("views", { ascending: false });
  if (error) return [];
  return (data as PageViewRow[]) ?? [];
}
