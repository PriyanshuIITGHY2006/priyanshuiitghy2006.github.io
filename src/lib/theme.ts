// Dark mode: a `data-theme` attribute on <html> drives every CSS custom
// property in resume.css. The actual light/dark decision for first paint
// happens in an inline script in index.html (so it runs before any CSS is
// applied and there's no flash of the wrong theme) — this module just keeps
// the toggle button in sync and persists explicit choices.

export type Theme = "light" | "dark";

const STORAGE_KEY = "site-theme";

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function getCurrentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable — theme still applies for this page load
  }
}

function iconFor(theme: Theme): string {
  return theme === "dark" ? "☀" : "☾";
}

export function mountThemeToggle(btn: HTMLButtonElement): void {
  const sync = () => {
    const theme = getCurrentTheme();
    btn.textContent = iconFor(theme);
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  };
  sync();

  btn.addEventListener("click", () => {
    applyTheme(getCurrentTheme() === "dark" ? "light" : "dark");
    sync();
  });

  // Follow the OS setting live if the visitor hasn't made an explicit choice.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (getStoredTheme()) return; // explicit choice wins
    applyTheme(e.matches ? "dark" : "light");
    sync();
  });
}
