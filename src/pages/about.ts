import { resume } from "../data/resume";
import { LINKS } from "../data/links";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xwvdajbr";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

const SITE_MAP: { label: string; href: string; note: string }[] = [
  { label: "Résumé", href: "#/resume", note: "the traditional one-page view" },
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
        <a class="about-card" href="${s.href}">
          <span class="about-card-label">${esc(s.label)}</span>
          <span class="about-card-note">${esc(s.note)}</span>
        </a>
      </li>`,
  ).join("");
  return `
    <h2 class="section about-sub">Around the site</h2>
    <ul class="about-list">${items}</ul>`;
}

function heroHtml(): string {
  return `
    <section class="hero">
      <p class="hero-eyebrow">Hi, I'm</p>
      <h1 class="hero-name">${esc(resume.name)}</h1>
      <p class="hero-role">B.Tech EEE (Math minor) · IIT Guwahati · Codeforces Expert</p>
      <p class="hero-tagline">
        Sophomore engineer living somewhere between competitive programming,
        machine learning, and quantitative finance — building things, breaking
        things, and writing up what I learn along the way.
      </p>
      <div class="hero-actions">
        <a class="link" href="#/resume">Résumé →</a>
        <a class="link" href="#/projects">Projects →</a>
        <a class="link" href="${LINKS.github}" target="_blank" rel="noopener">GitHub ↗</a>
        <a class="link" href="${LINKS.codeforces}" target="_blank" rel="noopener">Codeforces ↗</a>
        <a class="link" href="${LINKS.linkedin}" target="_blank" rel="noopener">LinkedIn ↗</a>
        <a class="link" href="#contact-form">Contact →</a>
      </div>
    </section>`;
}

function pageHtml(): string {
  return `
    <article class="page section-page about-page">
      ${heroHtml()}

      <div class="section-body">
        <h2 class="section">About</h2>
        <div class="about-intro">
          <p>
            I'm a sophomore B.Tech student in Electronics and Electrical Engineering
            (with a Mathematics minor) at IIT Guwahati. What i do is a bit cp then a
            little bit more cp and then a little bit more cp and sleep.
          </p>
          <p>
            I compete on Codeforces as an Expert and spend a good deal of time on
            the other side of the table too — exploring c++ in depth and touching some
            grass.
          </p>
          <p>
            This is my portfolio and my dumb thoughts and my learning on some os and cp
            stuff.
          </p>
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
