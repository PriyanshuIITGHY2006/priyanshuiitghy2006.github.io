import { resume } from "../data/resume";
import { LINKS } from "../data/links";
import { PROJECTS } from "../data/projects";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xwvdajbr";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

// Pulled straight from the same data the Projects page renders — "date"
// ends in "Present" for anything still ongoing — so this can't drift out
// of sync with what's actually true there.
function currentlyHtml(): string {
  const ongoing = PROJECTS.filter((p) => p.date.trim().endsWith("Present"));
  if (!ongoing.length) return "";
  const items = ongoing
    .map(
      (p) => `
      <li>
        <a class="link" href="#/projects">${esc(p.title)}</a>
        <p class="about-list-note">${esc(p.tagline)}</p>
      </li>`,
    )
    .join("");
  return `
    <h2 class="section about-sub">Currently building</h2>
    <ul class="about-list">${items}</ul>`;
}

const SITE_MAP: { label: string; href: string; note: string }[] = [
  { label: "Education", href: "#/education", note: "degree, grade card, curriculum" },
  { label: "Projects", href: "#/projects", note: "full write-ups, one per project" },
  { label: "Skills", href: "#/skills", note: "languages, libraries, concepts" },
  { label: "Positions", href: "#/positions", note: "roles and responsibilities" },
  { label: "Achievements", href: "#/achievements", note: "contests, hackathons, exams" },
  { label: "Gallery", href: "#/gallery", note: "certificates and scorecards" },
  { label: "Codeforces", href: "#/codeforces", note: "rating, activity, problem breakdown" },
  { label: "GitHub", href: "#/github", note: "profile and recent commits" },
  { label: "Blog", href: "#/blogs", note: "write-ups on what I'm building" },
];

function siteMapHtml(): string {
  const items = SITE_MAP.map(
    (s) => `
      <li>
        <a class="link" href="${s.href}">${esc(s.label)}</a>
        <span class="about-list-note-inline">${esc(s.note)}</span>
      </li>`,
  ).join("");
  return `
    <h2 class="section about-sub">Around the site</h2>
    <ul class="about-list about-list-compact">${items}</ul>`;
}

function pageHtml(): string {
  return `
    <article class="page section-page about-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)} · About</span>
      </nav>

      <div class="section-body">
        <h2 class="section">About</h2>
        <div class="about-intro">
          <p>
            I'm a first-year B.Tech student in Electronics and Electrical Engineering
            (with a Mathematics minor) at IIT Guwahati. Most of what I do sits at the
            intersection of algorithms, mathematics, and building things end to end —
            from competitive-programming problem sets to machine-learning pipelines
            and quantitative trading strategies.
          </p>
          <p>
            I compete on Codeforces as an Expert (anyways, it doesn't matter provided 
            the amount of folks cheat nowadays) , and spend a good deal of time on
            the other side of the table too — exploring c++ in depth and touching some
            grass.
          </p>
          <p>
            This site doubles as an interactive résumé and a place to write about
            what I'm building — problem write-ups, project post-mortems, and notes
            on whatever I've been debugging most recently.
          </p>
        </div>

        ${currentlyHtml()}

        <h2 class="section about-sub">Elsewhere</h2>
        <p class="edu-note">
          These link to what's built into this site — live rating/activity pulled
          straight from the APIs, not just a static badge. The actual GitHub and
          Codeforces profiles are one click further, linked from those pages.
        </p>
        <div class="pj-links about-links">
          <a class="pj-link" href="#/github">GitHub →</a>
          <a class="pj-link" href="#/codeforces">Codeforces →</a>
          <a class="pj-link" href="${LINKS.linkedin}" target="_blank" rel="noopener">LinkedIn ↗</a>
          <a class="pj-link" href="#/blogs">Blog →</a>
        </div>

        ${siteMapHtml()}

        <h2 class="section about-sub">Get in touch</h2>
        <p class="edu-note">
          Reach out directly, or send a message through the form below.
        </p>

        <div class="about-contact-direct">
          <a class="link" href="mailto:${LINKS.emailPersonal}">${LINKS.emailPersonal}</a>
          <a class="link" href="mailto:${LINKS.emailInstitute}">${LINKS.emailInstitute}</a>
          <a class="link" href="tel:${LINKS.phone}">${LINKS.phoneDisplay}</a>
        </div>

        <form id="contact-form" class="contact-form" action="${FORMSPREE_ENDPOINT}" method="POST">
          <div id="contact-status" class="contact-status" style="display:none"></div>
          <div class="contact-row">
            <div>
              <label for="cf-name">Name</label>
              <input id="cf-name" name="name" type="text" required autocomplete="name"/>
            </div>
            <div>
              <label for="cf-email">Email</label>
              <input id="cf-email" name="email" type="email" required autocomplete="email"/>
            </div>
          </div>
          <div>
            <label for="cf-message">Message</label>
            <textarea id="cf-message" name="message" required></textarea>
          </div>
          <div class="contact-actions">
            <button type="submit" class="pj-link contact-submit">Send message</button>
          </div>
        </form>
      </div>
    </article>`;
}

export function mountAbout(container: HTMLElement): void {
  container.innerHTML = pageHtml();

  const form = container.querySelector<HTMLFormElement>("#contact-form");
  const status = container.querySelector<HTMLElement>("#contact-status");
  if (!form || !status) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector<HTMLButtonElement>(".contact-submit")!;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    status.style.display = "none";

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error("Formspree responded with an error");
      status.textContent = "Message sent — thank you, I'll get back to you soon.";
      status.className = "contact-status contact-status-ok";
      status.style.display = "block";
      form.reset();
    } catch {
      status.textContent = "Something went wrong sending that — please email me directly instead.";
      status.className = "contact-status contact-status-err";
      status.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
    }
  });
}
