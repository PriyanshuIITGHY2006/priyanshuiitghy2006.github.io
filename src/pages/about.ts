import { resume } from "../data/resume";
import { LINKS } from "../data/links";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xwvdajbr";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

const SOCIAL_ICONS: { label: string; href: string; path: string }[] = [
  {
    label: "GitHub",
    href: LINKS.github,
    path: `<path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.5 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.46-1.19-1.11-1.51-1.11-1.51-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.36 1.12 2.93.85.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.05 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.9-1.33 2.74-1.05 2.74-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.92-2.34 4.79-4.57 5.04.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .28.18.6.69.5A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"/>`,
  },
  {
    label: "LinkedIn",
    href: LINKS.linkedin,
    path: `<path d="M6.94 8.5H3.56V21h3.38V8.5zM5.25 3c-1.15 0-1.98.83-1.98 1.9 0 1.06.8 1.9 1.94 1.9h.02c1.17 0 1.98-.84 1.98-1.9C7.19 3.83 6.4 3 5.25 3zM21 21h-3.38v-6.66c0-1.67-.6-2.8-2.1-2.8-1.14 0-1.82.77-2.12 1.5-.11.27-.14.64-.14 1.02V21H9.88s.05-11.32 0-12.5h3.38v1.77c.45-.7 1.25-1.7 3.05-1.7 2.23 0 3.9 1.46 3.9 4.58V21z"/>`,
  },
  {
    label: "Codeforces",
    href: LINKS.codeforces,
    path: `<path d="M4.5 7.5A1.5 1.5 0 0 1 6 9v10.5A1.5 1.5 0 0 1 4.5 21h-1A1.5 1.5 0 0 1 2 19.5V9a1.5 1.5 0 0 1 1.5-1.5h1zm8-4.5A1.5 1.5 0 0 1 14 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 10 19.5v-15A1.5 1.5 0 0 1 11.5 3h1zm8 8A1.5 1.5 0 0 1 22 12.5v7A1.5 1.5 0 0 1 20.5 21h-1a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5h1z"/>`,
  },
];

function socialsHtml(): string {
  const icons = SOCIAL_ICONS.map(
    (s) => `
      <a class="social-icon" href="${s.href}" target="_blank" rel="noopener" aria-label="${esc(s.label)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${s.path}</svg>
      </a>`,
  ).join("");

  return `
    <div class="hero-socials">
      <p class="socials-sub">reach out to me</p>
      <div class="socials-icons">${icons}</div>
      <p class="socials-mail">or mail me at <a class="link" href="mailto:${LINKS.emailPersonal}">${LINKS.emailPersonal}</a></p>

      <details class="contact-details">
        <summary>Contact</summary>
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
      </details>
    </div>`;
}

function heroHtml(): string {
  return `
    <section class="hero">
      <p class="hero-eyebrow">Hi, I'm</p>
      <h1 class="hero-name">${esc(resume.name)}</h1>
      <p class="hero-about">
        Sophomore B.Tech student in Electronics and Electrical Engineering
        (Mathematics minor) at IIT Guwahati. Codeforces Expert who spends most
        days doing a bit of cp, exploring c++ in depth, and occasionally
        touching grass — this is where I write about it.
      </p>
      <div class="hero-actions">
        <a class="link" href="#/resume">Résumé →</a>
        <a class="link" href="#/projects">Projects →</a>
        <a class="link" href="#/blogs">Blogs →</a>
      </div>
      ${socialsHtml()}
    </section>`;
}

function pageHtml(): string {
  return `
    <article class="page about-page">
      ${heroHtml()}
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
