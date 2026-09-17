import { createClient } from "@supabase/supabase-js";
import type { ResumeData } from "../types";
import { resume as staticResume } from "../data/resume";
import { ACHIEVEMENTS as staticAchievements, type DetailedAchievement } from "../data/achievements";
import { GALLERY as staticGallery, type GalleryItem } from "../data/gallery";
import { PROJECTS as staticProjects, type DetailedProject } from "../data/projects";
import { getProjectWriteup } from "./project-writeups";

// Pull credentials securely from Vite environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Résumé PDF (Supabase Storage) ────────────────────────────────────────
// Admin uploads to this fixed bucket/path (overwriting each time), so the
// frontend never needs a DB row to know where the file lives.
export const RESUME_PDF_BUCKET = "resume";
export const RESUME_PDF_FILE = "cv.pdf";

export function getResumePdfUrl(): string {
  return supabase.storage.from(RESUME_PDF_BUCKET).getPublicUrl(RESUME_PDF_FILE).data.publicUrl;
}

export async function resumePdfExists(): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(RESUME_PDF_BUCKET)
    .list("", { search: RESUME_PDF_FILE });
  if (error) return false;
  return (data ?? []).some((f) => f.name === RESUME_PDF_FILE);
}

// ─── Email campaign attachments (Supabase Storage, private bucket) ───────
// The send_campaign/send_test edge function pulls these server-side (via
// service role) and base64-embeds them into the outgoing email — the bucket
// itself is never made public.
export const EMAIL_ATTACHMENTS_BUCKET = "email-attachments";

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface DBProject {
  id: string;
  title: string;
  date: string;
  stack: string;
  link_text: string | null;
  link_href: string | null;
  link_detail: string | null;
  sort_order: number;
  show_in_cv: boolean;
  tagline: string | null;
  detail_html: string | null;
  highlights_text: string | null;
  verify: string | null;
}

interface DBProjectBullet {
  id: number;
  project_id: string;
  bullet: string;
  sort_order: number;
}

interface DBProjectLink {
  id: number;
  project_id: string;
  label: string;
  href: string;
  sort_order: number;
}

interface DBAchievement {
  id: string;
  html: string;
  date: string;
  sort_order: number;
  title: string | null;
  tags: string | null;
  blurb: string | null;
  verify: string | null;
  link_label: string | null;
  link_href: string | null;
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

interface DBSkill {
  id: number;
  label: string;
  items: string;
  sort_order: number;
}

interface DBPosition {
  id: number;
  html: string;
  date: string;
  sort_order: number;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loadResumeFromDB(): Promise<ResumeData> {
  try {
    const [
      { data: projects, error: pErr },
      { data: bullets, error: bErr },
      { data: achievements, error: aErr },
      { data: skills, error: sErr },
      { data: positions, error: posErr },
    ] = await Promise.all([
      supabase.from("projects").select("*").order("sort_order"),
      supabase.from("project_bullets").select("*").order("sort_order"),
      supabase.from("achievements").select("*").order("sort_order"),
      supabase.from("skills").select("*").order("sort_order"),
      supabase.from("positions").select("*").order("sort_order"),
    ]);

    if (pErr || bErr || aErr || sErr || posErr) {
      console.warn("[supabase] fetch error — falling back to static resume", {
        pErr,
        bErr,
        aErr,
        sErr,
        posErr,
      });
      return staticResume;
    }

    // Group bullets by project_id
    const bulletsByProject = new Map<string, string[]>();
    for (const b of (bullets as DBProjectBullet[]) ?? []) {
      const list = bulletsByProject.get(b.project_id) ?? [];
      list.push(b.bullet);
      bulletsByProject.set(b.project_id, list);
    }

    const mappedProjects = ((projects as DBProject[]) ?? [])
      .filter((p) => p.show_in_cv)
      .map((p) => ({
        id: p.id,
        title: p.title,
        date: p.date,
        stack: p.stack,
        ...(p.link_text && p.link_href
          ? {
              link: {
                text: p.link_text,
                href: p.link_href,
                external: true,
                ...(p.link_detail ? { detail: p.link_detail } : {}),
              },
            }
          : {}),
        bullets: bulletsByProject.get(p.id) ?? [],
      }));

    const mappedAchievements = ((achievements as DBAchievement[]) ?? []).map(
      (a) => ({ id: a.id, html: a.html, date: a.date }),
    );

    const mappedSkills = ((skills as DBSkill[]) ?? []).map((s) => ({
      label: s.label,
      items: s.items,
    }));

    const mappedPositions = ((positions as DBPosition[]) ?? []).map((p) => ({
      html: p.html,
      date: p.date,
    }));

    return {
      // Static fields not stored in DB (header info, education, pdf details)
      ...staticResume,
      projects: mappedProjects,
      achievements: mappedAchievements,
      skills: mappedSkills,
      positions: mappedPositions,
    };
  } catch (err) {
    console.warn("[supabase] unexpected error — falling back to static resume", err);
    return staticResume;
  }
}

// The standalone /achievements page reads the same `achievements` table as
// the résumé view, just using its richer columns (title/tags/blurb/verify/
// link) instead of the plain `html` line.
export async function loadDetailedAchievementsFromDB(): Promise<DetailedAchievement[]> {
  try {
    const { data, error } = await supabase.from("achievements").select("*").order("sort_order");
    if (error || !data) {
      console.warn("[supabase] achievements fetch error — falling back to static list", error);
      return staticAchievements;
    }
    const rows = data as DBAchievement[];
    // Rows without a title haven't been given rich content yet — skip them
    // on this page rather than showing a blank card.
    return rows
      .filter((a): a is DBAchievement & { title: string; blurb: string } => !!a.title && !!a.blurb)
      .map((a) => ({
        id: a.id,
        title: a.title,
        date: a.date,
        tags: a.tags ? a.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        blurb: a.blurb,
        ...(a.verify ? { verify: a.verify } : {}),
        ...(a.link_label && a.link_href ? { link: { label: a.link_label, href: a.link_href } } : {}),
      }));
  } catch (err) {
    console.warn("[supabase] unexpected error — falling back to static achievements", err);
    return staticAchievements;
  }
}

export async function loadGalleryFromDB(): Promise<GalleryItem[]> {
  try {
    const { data, error } = await supabase
      .from("site_images")
      .select("*")
      .eq("kind", "gallery")
      .order("sort_order");
    if (error || !data) {
      console.warn("[supabase] gallery fetch error — falling back to static list", error);
      return staticGallery;
    }
    return (data as DBSiteImage[]).map((g) => ({
      id: g.id,
      title: g.title,
      src: g.src,
      ...(g.date ? { date: g.date } : {}),
      ...(g.description ? { description: g.description } : {}),
    }));
  } catch (err) {
    console.warn("[supabase] unexpected error — falling back to static gallery", err);
    return staticGallery;
  }
}

// Every uploaded image regardless of kind — used to populate the "pick an
// already-uploaded image" dropdowns in the admin panel (achievement verify
// links, blog covers).
export async function loadAllSiteImages(): Promise<DBSiteImage[]> {
  const { data, error } = await supabase.from("site_images").select("*").order("sort_order");
  if (error || !data) return [];
  return data as DBSiteImage[];
}

// The standalone /projects + /project?id= pages read the same `projects`
// table the résumé uses (show_in_cv just toggles whether a row also
// appears there), plus its richer columns and the project_links child
// table for extra links beyond the résumé's single link_text/link_href.
// The long-form write-up body is never in the DB — it's a markdown file
// published straight to GitHub (see admin-publish.ts), bundled at build
// time via src/lib/project-writeups.ts, looked up here by id.
export async function loadDetailedProjectsFromDB(): Promise<DetailedProject[]> {
  try {
    const [{ data: projects, error: pErr }, { data: links, error: lErr }] = await Promise.all([
      supabase.from("projects").select("*").order("sort_order"),
      supabase.from("project_links").select("*").order("sort_order"),
    ]);
    if (pErr || lErr || !projects) {
      console.warn("[supabase] projects fetch error — falling back to static list", { pErr, lErr });
      return staticProjects;
    }

    const linksByProject = new Map<string, { label: string; href: string }[]>();
    for (const l of (links as DBProjectLink[]) ?? []) {
      const list = linksByProject.get(l.project_id) ?? [];
      list.push({ label: l.label, href: l.href });
      linksByProject.set(l.project_id, list);
    }

    // Rows without a tagline haven't been given rich content yet — skip
    // them on this page rather than showing a blank card.
    return (projects as DBProject[])
      .filter((p): p is DBProject & { tagline: string } => !!p.tagline)
      .map((p) => ({
        id: p.id,
        title: p.title,
        date: p.date,
        stack: p.stack.split(",").map((s) => s.trim()).filter(Boolean),
        tagline: p.tagline,
        detail: p.detail_html ? p.detail_html.split("\n").filter(Boolean) : [],
        highlights: p.highlights_text ? p.highlights_text.split("\n").filter(Boolean) : [],
        ...(p.link_text && p.link_href ? { link: { label: p.link_text, href: p.link_href } } : {}),
        ...(p.verify ? { verify: p.verify } : {}),
        ...(linksByProject.has(p.id) ? { extraLinks: linksByProject.get(p.id) } : {}),
        body: getProjectWriteup(p.id),
      }));
  } catch (err) {
    console.warn("[supabase] unexpected error — falling back to static projects", err);
    return staticProjects;
  }
}
