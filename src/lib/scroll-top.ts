// Wires a "scroll to top" button that fades in once the reader has scrolled
// down. The button itself is expected to already be in the page's HTML
// (see BLOG.SCROLL_TOP_BUTTON_HTML below) — this module only attaches
// behavior to it. Re-mounting (e.g. navigating between blog pages) safely
// replaces the previous listeners instead of stacking new ones.

export const SCROLL_TOP_BUTTON_HTML =
  '<button type="button" class="scroll-top-btn" aria-label="Scroll to top">&uarr;</button>';

let detachPrevious: (() => void) | null = null;

export function initScrollTopButton(container: HTMLElement): void {
  if (detachPrevious) {
    detachPrevious();
    detachPrevious = null;
  }

  const btn = container.querySelector<HTMLButtonElement>(".scroll-top-btn");
  if (!btn) return;

  const SHOW_AFTER_PX = 480;

  const onScroll = () => {
    btn.classList.toggle("visible", window.scrollY > SHOW_AFTER_PX);
  };
  const onClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  btn.addEventListener("click", onClick);
  onScroll();

  detachPrevious = () => {
    window.removeEventListener("scroll", onScroll);
    btn.removeEventListener("click", onClick);
  };
}
