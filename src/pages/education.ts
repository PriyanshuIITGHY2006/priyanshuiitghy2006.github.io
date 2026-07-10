import type { ResumeData } from "../types";
import { resume } from "../data/resume";
import { loadResumeFromDB } from "../lib/supabase";
import {
  TRANSCRIPT,
  MINOR,
  GRADE_POINTS,
  type CourseGrade,
  type TranscriptSemester,
} from "../data/academics";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

// Short elaboration for each résumé education entry, keyed by degree text.
const ELABORATION: Record<string, { tag: string; blurb: string }> = {
  "B.Tech. Major": {
    tag: "Undergraduate · Ongoing",
    blurb:
      "Four-year Bachelor of Technology in Electronics &amp; Electrical Engineering. " +
      "First-year core spans circuits, signals &amp; systems, digital logic, " +
      "electromagnetics and a full engineering-mathematics sequence, alongside " +
      "programming and data structures in C. Currently among the top of the cohort.",
  },
  "B.Tech. Minor (Mathematics)": {
    tag: "Minor · Ongoing",
    blurb:
      "An additional structured stream in Mathematics taken on top of the EEE major, " +
      "deepening the analysis, linear algebra and probability foundations that underpin " +
      "signal processing, machine learning and quantitative work.",
  },
  "Senior Secondary": {
    tag: "Class XII · Completed",
    blurb:
      "West Bengal Council of Higher Secondary Education (WBCHSE), Science stream. " +
      "Scored 95.0%, and cleared JEE Advanced 2025 with All-India Rank 1941 " +
      "(top 1% of 1.5 lakh+ candidates) to enter IIT Guwahati.",
  },
};

function gradeBadge(g: string): string {
  const pts = GRADE_POINTS[g];
  const title = pts ? `Grade ${g} (${pts})` : `Grade ${g}`;
  const cls = g === "PP" ? "grade grade-pp" : "grade";
  return `<span class="${cls}" title="${title}">${esc(g)}</span>`;
}

function transcriptSemester(s: TranscriptSemester): string {
  const rows = s.courses
    .map(
      (c: CourseGrade) => `
        <tr>
          <td class="gc-code">${esc(c.code)}</td>
          <td class="gc-name">${esc(c.name)}</td>
          <td class="gc-cr">${c.credits}</td>
          <td class="gc-gr">${gradeBadge(c.grade)}</td>
        </tr>`
    )
    .join("");
  const totalCr = s.courses.reduce((a, c) => a + c.credits, 0);
  return `
    <div class="gc-sem">
      <h4 class="gc-sem-title">${esc(s.label)}</h4>
      <table class="gc-table">
        <thead>
          <tr><th>Code</th><th>Course</th><th>Cr.</th><th>Gr.</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td></td>
            <td class="gc-foot">Total credits · S.P.I</td>
            <td class="gc-cr">${totalCr}</td>
            <td class="gc-spi">${esc(s.spi)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function gradeCard(): string {
  const t = TRANSCRIPT;
  const legend = Object.entries(GRADE_POINTS)
    .filter(([g]) => g !== "BC" && g !== "CC" && g !== "CD" && g !== "DD")
    .map(([g, p]) => `<span class="gc-leg-item"><b>${g}</b> ${p}</span>`)
    .join("");
  return `
    <section class="gradecard"
             aria-label="IIT Guwahati Bachelor of Technology Grade Card for Priyanshu Debnath">
      <header class="gc-head">
        <div class="gc-logo">
          <img src="iitg_logo.jpg" alt=""
               onerror="this.style.display='none'"/>
        </div>
        <div class="gc-head-text">
          <div class="gc-inst">${esc(t.institute)}</div>
          <div class="gc-sub">${esc(t.programme)} — Grade Card (Provisional)</div>
        </div>
      </header>
      <div class="gc-meta">
        <div><span>Name</span>${esc(t.name)}</div>
        <div><span>Roll No.</span>${esc(t.roll)}</div>
        <div><span>Discipline</span>${esc(t.discipline)}</div>
        <div><span>Admission</span>${esc(t.admission)}</div>
        <div><span>Division</span>${esc(t.division)}</div>
        <div><span>Min. Duration</span>${esc(t.minDuration)}</div>
      </div>

      <div class="gc-sems">
        ${t.semesters.map(transcriptSemester).join("")}
      </div>

      <div class="gc-summary">
        <table class="gc-cpi">
          <thead>
            <tr><th></th><th>Sem I</th><th>Sem II</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><th>S.P.I</th><td>${esc(t.semesters[0].spi)}</td><td>${esc(t.semesters[1].spi)}</td><td rowspan="2" class="gc-status">${esc(t.status)}</td></tr>
            <tr><th>C.P.I</th><td>${esc(t.cpi.semI)}</td><td><b>${esc(t.cpi.semII)}</b></td></tr>
          </tbody>
        </table>
        <div class="gc-legend"><span class="gc-leg-label">Grade points</span>${legend}</div>
      </div>
    </section>`;
}

function minorCourses(): string {
  const rows = MINOR.courses
    .map(
      (c) => `
        <tr>
          <td class="gc-code">${esc(c.code)}</td>
          <td class="gc-name">${esc(c.name)}</td>
          <td class="mn-sess">${esc(c.session)}</td>
          <td class="gc-gr">${gradeBadge(c.grade)}</td>
        </tr>`
    )
    .join("");
  return `
    <div class="edu-minor">
      <table class="gc-table mn-table">
        <thead>
          <tr><th>Code</th><th>Course</th><th>Session</th><th>Gr.</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function eduEntries(data: ResumeData): string {
  return data.education
    .map((r) => {
      const e = ELABORATION[r.degree];
      const isMinor = /minor/i.test(r.degree);
      return `
        <li class="edu-entry">
          <div class="edu-entry-head">
            <h3 class="edu-degree">${esc(r.degree)}</h3>
            ${e ? `<span class="edu-tag">${e.tag}</span>` : ""}
          </div>
          <div class="edu-institute">${esc(r.institute)}</div>
          <div class="edu-facts">
            <span class="edu-fact"><span>Score</span>${esc(r.score)}</span>
            <span class="edu-fact"><span>Year</span>${esc(r.year)}</span>
          </div>
          ${e ? `<p class="edu-blurb">${e.blurb}</p>` : ""}
          ${isMinor ? minorCourses() : ""}
        </li>`;
    })
    .join("");
}

function pageHtml(data: ResumeData): string {
  return `
    <article class="page section-page edu-page">
      <nav class="section-nav">
        <a class="section-back" href="#/resume">← back to résumé</a>
        <span class="section-crumb">${esc(data.name)} · Education</span>
      </nav>

      <div class="section-body">
        <h2 class="section">Education</h2>
        <ul class="edu-entries">${eduEntries(data)}</ul>

        <h2 class="section edu-sub">Official Grade Card</h2>
        ${gradeCard()}
      </div>
    </article>`;
}

// Render the elaborated Education page. Static copy first, then swap in
// live Supabase data (matching the home page) so there is no blank flash.
export function mountEducation(container: HTMLElement): void {
  container.innerHTML = pageHtml(resume);

  loadResumeFromDB()
    .then((live) => {
      container.innerHTML = pageHtml(live);
    })
    .catch(() => {
      /* DB unreachable — static version already shown */
    });
}
