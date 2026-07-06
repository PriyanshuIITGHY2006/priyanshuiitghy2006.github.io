import { createClient } from "@supabase/supabase-js";
import type { ResumeData } from "../types";
import { resume as staticResume } from "../data/resume";

// Pull credentials securely from Vite environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
}

interface DBProjectBullet {
  id: number;
  project_id: string;
  bullet: string;
  sort_order: number;
}

interface DBAchievement {
  id: string;
  html: string;
  date: string;
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

    const mappedProjects = ((projects as DBProject[]) ?? []).map((p) => ({
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
