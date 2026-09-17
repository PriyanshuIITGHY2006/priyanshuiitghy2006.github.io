import { resume } from "../data/resume";
import { setPageMeta } from "../lib/seo";
import { supabase } from "../lib/supabase";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function shell(bodyHtml: string): string {
  return `
    <article class="page section-page not-found-page">
      <nav class="section-nav">
        <a class="section-back" href="/">← back</a>
        <span class="section-crumb">${esc(resume.name)}</span>
      </nav>
      <div class="section-body not-found-body">
        ${bodyHtml}
      </div>
    </article>`;
}

export function mountUnsubscribe(container: HTMLElement, token: string | null): void {
  setPageMeta({ title: "Unsubscribe", noindex: true });

  if (!token) {
    container.innerHTML = shell(`
      <h2 class="section not-found-code">Unsubscribe</h2>
      <p class="edu-note not-found-msg">This link is missing its token, so there's nothing to unsubscribe.</p>
      <p class="edu-note"><a class="link" href="/">Head back home</a>.</p>
    `);
    return;
  }

  container.innerHTML = shell(`
    <h2 class="section not-found-code">Unsubscribe</h2>
    <p class="edu-note not-found-msg">Removing you from the mailing list&hellip;</p>
  `);

  void (async () => {
    try {
      const { error } = await supabase.rpc("unsubscribe_by_token", { p_token: token });
      if (error) throw error;
      container.innerHTML = shell(`
        <h2 class="section not-found-code">Unsubscribed</h2>
        <p class="edu-note not-found-msg">You won't get any more emails from this list. Sorry to see you go.</p>
        <p class="edu-note"><a class="link" href="/">Head back home</a>.</p>
      `);
    } catch {
      container.innerHTML = shell(`
        <h2 class="section not-found-code">Something went wrong</h2>
        <p class="edu-note not-found-msg">Couldn't process that unsubscribe link — it may already be used, or invalid.</p>
        <p class="edu-note"><a class="link" href="/">Head back home</a>.</p>
      `);
    }
  })();
}
