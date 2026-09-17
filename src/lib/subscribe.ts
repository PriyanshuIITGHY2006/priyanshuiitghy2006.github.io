// Subscribe-to-blog form: captures name + email into Supabase (blog_subscribers
// table) so new-post notification emails can be sent out later. Sending itself
// is not wired up yet — this only stores signups.

import { subscribeToBlog } from "./blog-engagement";
import { renderTurnstileWidget, resetTurnstileWidget, getTurnstileToken } from "./turnstile";

export const SUBSCRIBE_FORM_HTML = `
  <div class="blog-subscribe">
    <h3 class="section blog-subscribe-title">Get new posts by email</h3>
    <p class="edu-note">You will get an email when a new post goes up.</p>
    <form class="contact-form blog-subscribe-form">
      <div id="blog-subscribe-status" class="contact-status" style="display:none"></div>
      <div>
        <label for="bs-name">Name</label>
        <input id="bs-name" name="name" type="text" maxlength="60" required autocomplete="name" />
      </div>
      <div>
        <label for="bs-email">Email</label>
        <input id="bs-email" name="email" type="email" maxlength="200" required autocomplete="email" />
      </div>
      <div class="cf-turnstile" data-sitekey="${import.meta.env.VITE_TURNSTILE_SITE_KEY}"></div>
      <div class="contact-actions">
        <button type="submit" class="pj-link contact-submit" disabled>Subscribe</button>
      </div>
    </form>
  </div>`;

export function wireSubscribeForm(container: HTMLElement): void {
  const form = container.querySelector<HTMLFormElement>(".blog-subscribe-form");
  const status = container.querySelector<HTMLElement>("#blog-subscribe-status");
  if (!form || !status) return;

  const submitBtn = form.querySelector<HTMLButtonElement>(".contact-submit")!;
  renderTurnstileWidget(form, () => { submitBtn.disabled = false; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = container.querySelector<HTMLInputElement>("#bs-name")!.value.trim();
    const email = container.querySelector<HTMLInputElement>("#bs-email")!.value.trim();
    const turnstileToken = getTurnstileToken(form);
    if (!name || !email || !turnstileToken) return;

    submitBtn.disabled = true;
    status.style.display = "none";
    try {
      const { alreadySubscribed } = await subscribeToBlog(name, email, turnstileToken);
      status.textContent = alreadySubscribed
        ? "You're already subscribed with that email."
        : "Subscribed — you'll get an email when a new post goes up.";
      status.className = "contact-status contact-status-ok";
      status.style.display = "block";
      if (!alreadySubscribed) form.reset();
    } catch {
      status.textContent = "Something went wrong subscribing — please try again.";
      status.className = "contact-status contact-status-err";
      status.style.display = "block";
    } finally {
      resetTurnstileWidget(form);
      submitBtn.disabled = true;
    }
  });
}
