// Lightweight themed replacement for the browser's native confirm() — used
// by the admin panel so destructive actions (delete project, delete
// comment, ...) get a modal that actually matches the site instead of a
// jarring native dialog.

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .confirm-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
      animation: confirm-fade-in 0.12s ease;
    }
    .confirm-card {
      background: var(--bg-card);
      border: 0.6px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 28px var(--shadow);
      max-width: 24rem;
      width: 100%;
      padding: 1.3rem 1.4rem;
      font-family: var(--cm);
      color: var(--ink);
      animation: confirm-pop-in 0.14s ease;
    }
    .confirm-message { font-size: 0.95em; line-height: 1.5; margin: 0 0 1.1rem; color: var(--ink-soft); }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 0.6rem; }
    @keyframes confirm-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes confirm-pop-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
  `;
  document.head.appendChild(style);
}

/** Resolves true if confirmed, false if cancelled/dismissed. */
export function confirmDialog(message: string, confirmLabel = "Delete"): Promise<boolean> {
  injectStyles();
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.innerHTML = `
      <div class="confirm-card" role="alertdialog" aria-modal="true">
        <p class="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="pj-link" data-confirm-cancel>Cancel</button>
          <button type="button" class="pj-link admin-btn-danger" data-confirm-ok></button>
        </div>
      </div>`;
    backdrop.querySelector(".confirm-message")!.textContent = message;
    const okBtn = backdrop.querySelector<HTMLButtonElement>("[data-confirm-ok]")!;
    okBtn.textContent = confirmLabel;

    function close(result: boolean): void {
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      resolve(result);
    }
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") close(false);
    }

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
    });
    backdrop.querySelector("[data-confirm-cancel]")!.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKeydown);

    document.body.appendChild(backdrop);
    okBtn.focus();
  });
}
