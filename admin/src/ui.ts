export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/** Shows a message in a status box; success messages hide after a few seconds. */
export function setStatus(el: HTMLElement | null, msg: string, ok: boolean): void {
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${ok ? "ok" : "err"}`;
  el.hidden = false;
  window.clearTimeout(Number(el.dataset.timer));
  if (ok) el.dataset.timer = String(window.setTimeout(() => { el.hidden = true; }, 4000));
}

export function emptyRow(colspan: number, label: string): string {
  return `<tr><td colspan="${colspan}" class="empty">${esc(label)}</td></tr>`;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
