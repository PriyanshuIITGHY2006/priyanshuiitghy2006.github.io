// ─── Resume data model ────────────────────────────────────────────────
// Everything the resume renders is described by these typed structures.
// Each clickable thing carries an optional `detail` id so that, in the next
// phase, a click can open a rich detail view (and the data can come from
// Supabase instead of this static file).

export interface LinkRef {
  /** Visible text. */
  text: string;
  /** Destination. Omit for plain text fragments. */
  href?: string;
  /** Opens in a new tab when true (external links). */
  external?: boolean;
  /** Future hook: id of the detail view this click should open. */
  detail?: string;
}

/** A line of text composed of plain + linked fragments (used in the header). */
export type RichLine = LinkRef[];

export interface EduRow {
  degree: string;
  institute: string;
  score: string;
  year: string;
}

export interface Project {
  id: string;
  title: string;
  date: string;
  stack: string;
  /** Right-aligned link on the stack line (e.g. "Github" / "LinkedIn"). */
  link?: LinkRef;
  /** Bullet points. May contain inline <b> markup, matching the PDF. */
  bullets: string[];
}

export interface SkillLine {
  label: string;
  items: string;
}

export interface Position {
  /** May contain inline <b> markup. */
  html: string;
  date: string;
}

export interface Achievement {
  id: string;
  /** May contain inline <b> and <a> markup. */
  html: string;
  date: string;
}

export interface ResumeData {
  name: string;
  /** Left-column identity lines below the name. */
  identity: string[];
  /** Right-column contact lines (each a RichLine). */
  contact: RichLine[];
  pdfUrl: string;
  pdfName: string;
  education: EduRow[];
  projects: Project[];
  skills: SkillLine[];
  positions: Position[];
  achievements: Achievement[];
}
