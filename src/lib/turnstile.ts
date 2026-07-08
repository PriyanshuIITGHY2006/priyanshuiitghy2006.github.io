// Shared Cloudflare Turnstile widget helper. Renders a widget into a
// `.cf-turnstile` element inside the given container and calls back once
// solved; the container also ends up holding a hidden `cf-turnstile-response`
// input that carries the solved token. Reused by the runnable-code panel,
// the subscribe form, and the comment form.

export function renderTurnstileWidget(container: HTMLElement, onSolved: () => void): void {
  const el = container.querySelector<HTMLElement>(".cf-turnstile");
  if (!el) return;

  const tryRender = () => {
    const ts = (window as any).turnstile;
    if (!ts) {
      setTimeout(tryRender, 100);
      return;
    }
    if (el.dataset.tsRendered === "1") return;
    el.dataset.tsRendered = "1";
    const widgetId = ts.render(el, {
      sitekey: el.dataset.sitekey,
      callback: onSolved,
    });
    el.dataset.tsWidgetId = widgetId;
  };
  tryRender();
}

export function resetTurnstileWidget(container: HTMLElement): void {
  const el = container.querySelector<HTMLElement>(".cf-turnstile");
  const ts = (window as any).turnstile;
  if (ts && el?.dataset.tsWidgetId) ts.reset(el.dataset.tsWidgetId);
}

export function getTurnstileToken(container: HTMLElement): string {
  return (container.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ?? "";
}
