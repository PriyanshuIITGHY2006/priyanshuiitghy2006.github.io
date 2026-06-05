// ─── Detailed achievements (Achievements page) ────────────────────────
// Curated, elaborated achievement entries shown on the #/achievements page.
// `verify` points at a gallery item id, producing a deep-link to the proof
// (certificate image / PDF) that opens full-screen: #/gallery?img=<id>.

export interface DetailedAchievement {
  id: string;
  title: string;
  date: string;
  /** Short badges, e.g. rank / medal / percentile. */
  tags: string[];
  /** Elaboration — may contain trusted inline <b>/<i> markup. */
  blurb: string;
  /** Gallery item id for a "Verify" deep-link. */
  verify?: string;
  /** Optional external/related link. */
  link?: { label: string; href: string };
}

export const ACHIEVEMENTS: DetailedAchievement[] = [
  {
    id: "kriti-2026",
    title: "Kriti 2026 — Gold Medal, Artificial Intelligence Challenge",
    date: "Jun 2026",
    tags: ["🥇 Gold Medal", "AI Challenge", "Kriti 2026"],
    blurb:
      "Won the <b>Gold medal</b> in the <b>Artificial Intelligence Challenge</b> at " +
      "Kriti 2026 — IIT Guwahati's flagship inter-hostel technical championship — as " +
      "part of the AI Challenge team. The win was certified by the General Secretary, " +
      "Technical Board, Students' Gymkhana Council.",
    verify: "kriti-2026",
  },
  {
    id: "ams-derive-2026",
    title: "AMS Derive 2026 — PRIOR Round, Official Rank 199",
    date: "Jun 2026",
    tags: ["Rank 199", "PRIOR Round", "Jane Street · QRT"],
    blurb:
      "Secured <b>Official Rank 199</b> in the inaugural <b>AMS Derive 2026 PRIOR Round</b>, " +
      "a quantitative and algorithmic problem-solving contest run by the Algorithms & " +
      "Mathematics Society. The circuit's apex and convergence partners were " +
      "<b>Jane Street</b> and <b>QRT</b>.",
    verify: "ams-derive-2026",
  },
  {
    id: "jee-advanced",
    title: "JEE Advanced 2025 — All India Rank 1941",
    date: "2025",
    tags: ["AIR 1941", "Top 1%"],
    blurb:
      "All India Rank 1941 among 1.5 lakh+ qualified candidates (top 1%) in one of the " +
      "world's most competitive entrance examinations, securing admission to IIT Guwahati.",
  },
  {
    id: "jee-main",
    title: "JEE Main 2025 — 99.69 Percentile",
    date: "2025",
    tags: ["AIR 4738", "99.69 %ile"],
    blurb:
      "All India Rank 4738 with a <b>99.69 percentile</b> across 12 lakh+ candidates.",
  },
  {
    id: "competitive-programming",
    title: "Competitive Programming — Codeforces Specialist & CodeChef 2-Star",
    date: "2025–Present",
    tags: ["Codeforces Specialist", "CodeChef 2★", "250+ solved"],
    blurb:
      "Codeforces <b>Specialist</b> and CodeChef <b>2-Star</b>, with <b>250+ problems</b> " +
      "solved across difficulty bands and algorithmic topics, all archived automatically.",
    link: { label: "Codeforces profile", href: "#/codeforces" },
  },
];
