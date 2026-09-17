// ─── Official academic record ─────────────────────────────────────────
// Faithful transcription of the IIT Guwahati B.Tech Grade Card
// (Provisional) — Roll 250102242, Priyanshu Debnath — and the official
// Electronics & Electrical Engineering course structure (L-T-P-C).
//
// Rendered as a read-only HTML grade card on the Education page so the
// record can be reproduced perfectly without exposing a downloadable PDF.

export interface CourseGrade {
  code: string;
  name: string;
  credits: number;
  grade: string;
}

export interface TranscriptSemester {
  label: string;       // e.g. "Sem I — Monsoon Semester of AY 2025-26"
  courses: CourseGrade[];
  spi: string;
}

export interface Transcript {
  institute: string;
  programme: string;
  discipline: string;
  division: string;
  name: string;
  roll: string;
  admission: string;
  minDuration: string;
  semesters: TranscriptSemester[];
  cpi: { semI: string; semII: string };
  status: string;
  issued: string;
}

export const TRANSCRIPT: Transcript = {
  institute: "Indian Institute of Technology Guwahati",
  programme: "Bachelor of Technology",
  discipline: "Electronics and Electrical Engineering",
  division: "Department of Electronics and Electrical Engineering",
  name: "PRIYANSHU DEBNATH",
  roll: "250102242",
  admission: "July 2025",
  minDuration: "8 Semesters / 4 Years",
  semesters: [
    {
      label: "Sem I — Monsoon Semester of AY 2025-26",
      spi: "9.68",
      courses: [
        { code: "CS1102", name: "Programming and Data Structures", credits: 6, grade: "AA" },
        { code: "CS1106L", name: "Programming and Data Structures Lab", credits: 3, grade: "AB" },
        { code: "EE1115", name: "Principles of Electrical Engineering", credits: 6, grade: "AB" },
        { code: "EE1116L", name: "Electrical Workshop", credits: 3, grade: "AB" },
        { code: "MA1303H", name: "Single Variable Calculus", credits: 4, grade: "AS" },
        { code: "MA1503H", name: "Multi Variable Calculus", credits: 4, grade: "AA" },
        { code: "ME1102", name: "Engineering Mechanics", credits: 6, grade: "AA" },
        { code: "PH1111H", name: "Introductory Classical Mechanics", credits: 3, grade: "AS" },
        { code: "PH1311H", name: "Modern Physics", credits: 3, grade: "AS" },
      ],
    },
    {
      label: "Sem II — Winter Semester of AY 2025-26",
      spi: "9.36",
      courses: [
        { code: "CE1202", name: "Engineering Drawing", credits: 5, grade: "AA" },
        { code: "EE1217", name: "Digital Circuits", credits: 6, grade: "AB" },
        { code: "EE1219", name: "Signals and Systems", credits: 8, grade: "BB" },
        { code: "MA1403", name: "Linear Algebra", credits: 4, grade: "AA" },
        { code: "MA1603", name: "Complex Analysis", credits: 4, grade: "AS" },
        { code: "ME1202L", name: "Workshop Practice", credits: 3, grade: "AA" },
        { code: "PH1202L", name: "Physics Lab", credits: 3, grade: "AB" },
        { code: "PH1212H", name: "Introductory Electromagnetics", credits: 3, grade: "AA" },
        { code: "PH1412H", name: "Introductory Quantum Mechanics", credits: 3, grade: "AA" },
        { code: "SA1209", name: "Meditation", credits: 0, grade: "PP" },
      ],
    },
  ],
  cpi: { semI: "9.68", semII: "9.52" },
  status: "Incomplete",
  issued: "27.05.2026",
};

// ─── Minor in Mathematics ──────────────────────────────────────────────
export interface MinorCourse {
  code: string;
  name: string;
  session: string;
  grade: string;
}

export const MINOR: {
  title: string;
  cgpa: string;
  courses: MinorCourse[];
} = {
  title: "Minor in Mathematics",
  cgpa: "9.00",
  courses: [
    { code: "MA1092M", name: "Modern Algebra", session: "Jan–May 2026", grade: "AB" },
  ],
};

// Grade → point value (IITG 10-point scale). Used only for the legend.
export const GRADE_POINTS: Record<string, string> = {
  AS: "10",
  AA: "10",
  AB: "9",
  BB: "8",
  BC: "7",
  CC: "6",
  CD: "5",
  DD: "4",
  PP: "Pass",
};

// ─── Official EEE course structure (L-T-P-C), Sem I & II ───────────────
export interface CurriculumCourse {
  name: string;
  l: number;
  t: number;
  p: number;
  c: number;
}

export interface CurriculumSemester {
  label: string;
  courses: CurriculumCourse[];
  subtotal: { l: number; t: number; p: number; c: number };
}

export const CURRICULUM: CurriculumSemester[] = [
  {
    label: "Semester I",
    subtotal: { l: 18, t: 6, p: 6, c: 40 },
    courses: [
      { name: "Single Variable Calculus", l: 3, t: 1, p: 0, c: 4 },
      { name: "Multi Variable Calculus", l: 3, t: 1, p: 0, c: 4 },
      { name: "Classical Mechanics", l: 2, t: 1, p: 0, c: 3 },
      { name: "Modern Physics", l: 2, t: 1, p: 0, c: 3 },
      { name: "Computer Programming and Data Structures in C", l: 3, t: 0, p: 0, c: 6 },
      { name: "Computer Programming in C Lab", l: 0, t: 0, p: 3, c: 3 },
      { name: "Engineering Mechanics", l: 2, t: 1, p: 0, c: 6 },
      { name: "Principles of Electrical Engineering", l: 3, t: 1, p: 0, c: 8 },
      { name: "Electronics Workshop", l: 0, t: 0, p: 3, c: 3 },
    ],
  },
  {
    label: "Semester II",
    subtotal: { l: 17, t: 5, p: 9, c: 39 },
    courses: [
      { name: "Linear Algebra", l: 3, t: 1, p: 0, c: 4 },
      { name: "Complex Analysis", l: 3, t: 1, p: 0, c: 4 },
      { name: "Quantum Mechanics", l: 2, t: 1, p: 0, c: 3 },
      { name: "Electrodynamics", l: 2, t: 1, p: 0, c: 3 },
      { name: "Physics Laboratory", l: 0, t: 0, p: 3, c: 3 },
      { name: "Engineering Drawing", l: 1, t: 0, p: 3, c: 5 },
      { name: "Digital Circuits", l: 3, t: 0, p: 0, c: 6 },
      { name: "Signals and Systems", l: 3, t: 1, p: 0, c: 8 },
      { name: "Workshop Practice", l: 0, t: 0, p: 3, c: 3 },
    ],
  },
];
