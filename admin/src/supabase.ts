import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

// The résumé page links to this fixed bucket/path; uploads overwrite it.
export const RESUME_PDF_BUCKET = "resume";
export const RESUME_PDF_FILE = "cv.pdf";

export function getResumePdfUrl(): string {
  return supabase.storage.from(RESUME_PDF_BUCKET).getPublicUrl(RESUME_PDF_FILE).data.publicUrl;
}

export interface DBSiteImage {
  id: string;
  title: string;
  src: string;
  date: string | null;
  description: string | null;
  kind: "gallery" | "blog-cover";
  sort_order: number;
}

// Every uploaded image regardless of kind, for the Images tab and the
// achievement "verify" / blog cover pickers.
export async function loadAllSiteImages(): Promise<DBSiteImage[]> {
  const { data, error } = await supabase.from("site_images").select("*").order("sort_order");
  if (error || !data) return [];
  return data as DBSiteImage[];
}
