// Easter egg: press ` (backtick) anywhere on the page (nothing editable
// focused) and a real terminal overlay drops down, mounted globally so
// it's available on every page. The headline command is `resume` — it
// prints the actual résumé data (src/data/resume.ts), plain-text
// formatted, right there in the terminal, not a placeholder.
//
// Rendered with xterm.js (the same engine behind VS Code's integrated
// terminal) instead of a DIY div-per-line + <input> — a real character
// grid, cursor, and ANSI colors instead of an approximation of one.
// Loaded lazily (only when the easter egg actually opens) since most
// visitors never trigger it.

import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { resume } from "../data/resume";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function rule(char = "-", width = 58): string {
  return char.repeat(width);
}

function formatContact(): string {
  const lines = ["CONTACT", rule()];
  resume.contact.forEach((row) => {
    const text = row.map((c) => c.text).join("").trim();
    if (text && text !== "|") lines.push(`  ${text}`);
  });
  return lines.join("\n");
}

function formatEducation(): string {
  const lines = ["EDUCATION", rule()];
  resume.education.forEach((e) => lines.push(`  ${e.degree} — ${e.institute} (${e.score}, ${e.year})`));
  return lines.join("\n");
}

function formatProjects(): string {
  const lines = ["PROJECTS", rule()];
  resume.projects.forEach((p) => {
    lines.push(`  ${p.title}  [${p.date}]`);
    lines.push(`    stack: ${p.stack}`);
    p.bullets.forEach((b) => lines.push(`    - ${stripHtml(b)}`));
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

function formatSkills(): string {
  const lines = ["SKILLS", rule()];
  resume.skills.forEach((s) => lines.push(`  ${s.label}: ${stripHtml(s.items)}`));
  return lines.join("\n");
}

function formatPositions(): string {
  const lines = ["POSITIONS", rule()];
  resume.positions.forEach((p) => lines.push(`  ${stripHtml(p.html)}  [${p.date}]`));
  return lines.join("\n");
}

function formatAchievements(): string {
  const lines = ["ACHIEVEMENTS", rule()];
  resume.achievements.forEach((a) => lines.push(`  ${stripHtml(a.html)}  [${a.date}]`));
  return lines.join("\n");
}

function formatAbout(): string {
  const lines = [rule("="), resume.name.toUpperCase(), ...resume.identity, rule("=")];
  return lines.join("\n");
}

function formatResume(): string {
  return [
    formatAbout(),
    "",
    formatContact(),
    "",
    formatEducation(),
    "",
    formatProjects(),
    "",
    formatSkills(),
    "",
    formatPositions(),
    "",
    formatAchievements(),
    "",
    "type 'open resume' to view the full interactive résumé page.",
  ].join("\n");
}

const FILES: Record<string, () => string> = {
  "resume.txt": formatResume,
  "about.txt": formatAbout,
  "education.txt": formatEducation,
  "projects.txt": formatProjects,
  "skills.txt": formatSkills,
  "positions.txt": formatPositions,
  "achievements.txt": formatAchievements,
  "contact.txt": formatContact,
};

const ROUTES: Record<string, string> = {
  home: "/", about: "/", resume: "/resume", projects: "/projects", skills: "/skills",
  positions: "/positions", achievements: "/achievements", education: "/education",
  blog: "/blogs", blogs: "/blogs", github: "/github", codeforces: "/codeforces", gallery: "/gallery",
};

const HELP_TEXT = [
  "Available commands:",
  "  resume              print the résumé right here",
  "  whoami              who am I talking to?",
  "  ls                  list files",
  "  cat <file>           print a file (try: cat projects.txt)",
  "  cd <page>            open a real page (try: cd projects)",
  "  clear               clear the screen",
  "  help                show this again",
  "  exit                close the terminal",
].join("\n");

const ANSI_RESET = "\x1b[0m";
const ANSI_RED = "\x1b[91m";

function runCommand(term: Terminal, raw: string, close: () => void): void {
  const trimmed = raw.trim();
  if (!trimmed) return;

  const [cmd, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(" ").toLowerCase();

  switch (cmd.toLowerCase()) {
    case "help":
      term.writeln(HELP_TEXT);
      break;
    case "whoami":
      term.writeln("guest");
      term.writeln(`(you're looking at ${resume.name}'s site — type 'resume' to see it all)`);
      break;
    case "resume":
      term.writeln(formatResume());
      break;
    case "ls":
      term.writeln(Object.keys(FILES).join("   "));
      break;
    case "cat": {
      const key = arg.replace(/\.txt$/, "") + ".txt";
      const fn = FILES[key] ?? FILES[arg];
      if (fn) term.writeln(fn());
      else term.writeln(`${ANSI_RED}cat: ${arg || "(missing file)"}: No such file${ANSI_RESET}`);
      break;
    }
    case "cd":
    case "open": {
      const route = ROUTES[arg];
      if (route) {
        term.writeln(`Navigating to ${route === "/" ? "home" : arg}…`);
        setTimeout(() => { location.hash = "#" + route; close(); }, 250);
      } else {
        term.writeln(`${ANSI_RED}cd: ${arg || "(missing page)"}: no such page — try: home, about, projects, skills, blog${ANSI_RESET}`);
      }
      break;
    }
    case "sudo":
      term.writeln(`${ANSI_RED}guest is not in the sudoers file. This incident will be reported.${ANSI_RESET}`);
      break;
    case "clear":
      term.clear();
      break;
    case "exit":
      close();
      break;
    default:
      term.writeln(`${ANSI_RED}command not found: ${cmd} — type 'help' for a list of commands${ANSI_RESET}`);
  }
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .term-window {
      position: fixed;
      background: #060806;
      border-radius: 5px;
      box-shadow: 0 0 0 1px rgba(77,255,136,0.12), 0 25px 70px rgba(0,0,0,0.6);
      display: flex; flex-direction: column;
      overflow: hidden;
      font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, "Liberation Mono", ui-monospace, monospace;
      animation: term-pop-in 0.14s ease;
      z-index: 100000;
      min-width: 280px;
      min-height: 160px;
    }
    .term-window.term-maximized {
      left: 0.75rem !important; top: 0.75rem !important;
      width: calc(100vw - 1.5rem) !important; height: calc(100vh - 1.5rem) !important;
    }
    .term-window.term-minimized {
      height: auto !important; width: 260px !important;
    }
    .term-window.term-minimized .term-body { display: none; }
    .term-titlebar {
      display: flex; align-items: center; gap: 0.45rem;
      padding: 0.5rem 0.7rem;
      background: #0e120e;
      border-bottom: 1px solid rgba(77,255,136,0.15);
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .term-window.term-maximized .term-titlebar { cursor: default; }
    .term-window.term-minimized .term-titlebar { cursor: pointer; }
    .term-dot {
      width: 11px; height: 11px; border-radius: 50%; display: inline-block;
      cursor: pointer; border: none; padding: 0; margin: 0;
      appearance: none; -webkit-appearance: none;
    }
    .term-dot:hover { filter: brightness(1.2); }
    .term-dot:focus-visible { outline: 2px solid #4dff88; outline-offset: 2px; }
    .term-dot-red { background: #ff5f56; }
    .term-dot-yellow { background: #ffbd2e; }
    .term-dot-green { background: #27c93f; }
    .term-title {
      flex: 1; text-align: center; font-size: 0.76em; color: #5fae74;
      margin-right: 2.4rem; pointer-events: none; letter-spacing: 0.02em;
    }
    .term-body {
      flex: 1; overflow: hidden; padding: 6px 4px 6px 8px;
    }
    .term-resize { position: absolute; z-index: 2; }
    .term-resize-n { top: -3px; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
    .term-resize-s { bottom: -3px; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
    .term-resize-e { right: -3px; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
    .term-resize-w { left: -3px; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
    .term-resize-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
    .term-resize-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
    .term-resize-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
    .term-resize-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
    .term-window.term-maximized .term-resize,
    .term-window.term-minimized .term-resize { display: none; }
    @keyframes term-pop-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
  `;
  document.head.appendChild(style);
}

let terminalOpen = false;
let winEl: HTMLDivElement | null = null;
let winState: "normal" | "minimized" | "maximized" = "normal";
let termEl: Terminal | null = null;
let fitAddonEl: FitAddon | null = null;

const RESIZE_MIN_WIDTH = 280;
const RESIZE_MIN_HEIGHT = 160;
const RESIZE_DIRECTIONS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function refit(): void {
  requestAnimationFrame(() => {
    try { fitAddonEl?.fit(); } catch { /* container not visible yet */ }
  });
}

// Adds 8 invisible edge/corner handles around the window so it can be
// resized in any direction, like a real OS window (disabled while
// maximized/minimized — hidden via CSS and gated here too).
function setupResize(win: HTMLDivElement, isLocked: () => boolean): void {
  for (const dir of RESIZE_DIRECTIONS) {
    const handle = document.createElement("div");
    handle.className = `term-resize term-resize-${dir}`;
    win.appendChild(handle);

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;
    let startL = 0;
    let startT = 0;

    handle.addEventListener("pointerdown", (e) => {
      if (isLocked()) return;
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = win.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
      startL = rect.left;
      startT = rect.top;
      handle.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let w = startW;
      let h = startH;
      let l = startL;
      let t = startT;
      if (dir.includes("e")) w = Math.max(RESIZE_MIN_WIDTH, startW + dx);
      if (dir.includes("s")) h = Math.max(RESIZE_MIN_HEIGHT, startH + dy);
      if (dir.includes("w")) {
        w = Math.max(RESIZE_MIN_WIDTH, startW - dx);
        l = startL + (startW - w);
      }
      if (dir.includes("n")) {
        h = Math.max(RESIZE_MIN_HEIGHT, startH - dy);
        t = startT + (startH - h);
      }
      win.style.width = `${w}px`;
      win.style.height = `${h}px`;
      win.style.left = `${l}px`;
      win.style.top = `${t}px`;
      refit();
    });
    function stopResize(e: PointerEvent): void {
      if (!resizing) return;
      resizing = false;
      try { handle.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    handle.addEventListener("pointerup", stopResize);
    handle.addEventListener("pointercancel", stopResize);
  }
}

// A minimal line editor on top of xterm's raw keystroke stream — xterm
// only gives you a character grid + cursor, not readline, so this wires
// up insert/backspace/delete, left/right/home/end, up/down history,
// Ctrl+C, and Ctrl+L by hand.
function setupShell(term: Terminal, close: () => void): void {
  let line = "";
  let cursor = 0;
  const history: string[] = [];
  let historyIndex = 0;

  function writePrompt(): void {
    term.write("\x1b[1;92mguest@priyanshu-portfolio\x1b[0m:\x1b[1;94m~\x1b[0m$ ");
  }

  function redraw(): void {
    term.write("\r\x1b[K");
    writePrompt();
    term.write(line);
    const back = line.length - cursor;
    if (back > 0) term.write(`\x1b[${back}D`);
  }

  function insertText(s: string): void {
    const clean = s.replace(/[\r\n\x00-\x1f\x7f]/g, "");
    if (!clean) return;
    line = line.slice(0, cursor) + clean + line.slice(cursor);
    cursor += clean.length;
    redraw();
  }

  function finalizeLine(): void {
    const val = line;
    term.write("\r\n");
    if (val.trim()) {
      history.push(val);
      historyIndex = history.length;
    }
    line = "";
    cursor = 0;
    runCommand(term, val, close);
    writePrompt();
  }

  term.onData((data) => {
    if (data.length === 1) {
      if (data === "\r") return finalizeLine();
      if (data === "\u007f") {
        if (cursor > 0) {
          line = line.slice(0, cursor - 1) + line.slice(cursor);
          cursor--;
          redraw();
        }
        return;
      }
      if (data === "\u0003") {
        term.write("^C\r\n");
        line = "";
        cursor = 0;
        historyIndex = history.length;
        writePrompt();
        return;
      }
      if (data === "\u000c") {
        term.clear();
        redraw();
        return;
      }
      if (data.charCodeAt(0) < 32) return;
      return insertText(data);
    }

    switch (data) {
      case "\x1b[A":
        if (historyIndex > 0) {
          historyIndex--;
          line = history[historyIndex] ?? "";
          cursor = line.length;
          redraw();
        }
        return;
      case "\x1b[B":
        if (historyIndex < history.length - 1) {
          historyIndex++;
          line = history[historyIndex] ?? "";
        } else {
          historyIndex = history.length;
          line = "";
        }
        cursor = line.length;
        redraw();
        return;
      case "\x1b[C":
        if (cursor < line.length) { cursor++; term.write("\x1b[C"); }
        return;
      case "\x1b[D":
        if (cursor > 0) { cursor--; term.write("\x1b[D"); }
        return;
      case "\x1b[3~":
        if (cursor < line.length) {
          line = line.slice(0, cursor) + line.slice(cursor + 1);
          redraw();
        }
        return;
      case "\x1b[H":
      case "\x1b[1~":
        cursor = 0;
        redraw();
        return;
      case "\x1b[F":
      case "\x1b[4~":
        cursor = line.length;
        redraw();
        return;
      default:
        if (data.startsWith("\x1b")) return;
        return insertText(data);
    }
  });

  term.writeln(`Welcome to ${resume.name}'s terminal.`);
  term.writeln("Type 'resume' to see the full résumé, or 'help' for more.");
  term.writeln("");
  writePrompt();
}

async function openTerminal(): Promise<void> {
  if (terminalOpen) {
    if (winState === "minimized" && winEl) {
      winEl.classList.remove("term-minimized");
      winState = "normal";
      refit();
    }
    termEl?.focus();
    return;
  }
  terminalOpen = true;
  winState = "normal";
  injectStyles();

  const win = document.createElement("div");
  win.className = "term-window";
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "Terminal");
  win.innerHTML = `
    <div class="term-titlebar">
      <button type="button" class="term-dot term-dot-red" aria-label="Close terminal" title="Close"></button>
      <button type="button" class="term-dot term-dot-yellow" aria-label="Minimize terminal" title="Minimize"></button>
      <button type="button" class="term-dot term-dot-green" aria-label="Maximize terminal" title="Maximize"></button>
      <span class="term-title">guest@priyanshu-portfolio: ~</span>
    </div>
    <div class="term-body" id="term-body"></div>`;

  const width = Math.min(window.innerWidth - 32, 720);
  const height = Math.min(window.innerHeight * 0.65, 512);
  win.style.width = `${width}px`;
  win.style.height = `${height}px`;
  win.style.left = `${Math.max(16, (window.innerWidth - width) / 2)}px`;
  win.style.top = `${Math.max(16, (window.innerHeight - height) / 2)}px`;

  document.body.appendChild(win);
  winEl = win;
  setupResize(win, () => winState !== "normal");

  const titlebar = win.querySelector<HTMLElement>(".term-titlebar")!;
  const dotClose = win.querySelector<HTMLButtonElement>(".term-dot-red")!;
  const dotMin = win.querySelector<HTMLButtonElement>(".term-dot-yellow")!;
  const dotMax = win.querySelector<HTMLButtonElement>(".term-dot-green")!;

  function close(): void {
    document.removeEventListener("keydown", onEscape, true);
    termEl?.dispose();
    termEl = null;
    fitAddonEl = null;
    win.remove();
    terminalOpen = false;
    winEl = null;
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  function setMinimized(on: boolean): void {
    winState = on ? "minimized" : "normal";
    win.classList.toggle("term-minimized", on);
    if (!on) refit();
  }

  function setMaximized(on: boolean): void {
    winState = on ? "maximized" : "normal";
    win.classList.toggle("term-maximized", on);
    refit();
  }

  dotClose.addEventListener("click", close);
  dotMin.addEventListener("click", () => setMinimized(winState !== "minimized"));
  dotMax.addEventListener("click", () => setMaximized(winState !== "maximized"));

  titlebar.addEventListener("dblclick", (e) => {
    if ((e.target as HTMLElement).closest(".term-dot")) return;
    setMaximized(winState !== "maximized");
  });

  // Clicking a minimized window's titlebar restores it.
  titlebar.addEventListener("click", (e) => {
    if (winState === "minimized" && !(e.target as HTMLElement).closest(".term-dot")) {
      setMinimized(false);
    }
  });

  // Dragging the titlebar moves the window (disabled while maximized).
  let dragging = false;
  let dragDX = 0;
  let dragDY = 0;
  titlebar.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".term-dot")) return;
    if (winState === "maximized") return;
    dragging = true;
    const rect = win.getBoundingClientRect();
    dragDX = e.clientX - rect.left;
    dragDY = e.clientY - rect.top;
    titlebar.setPointerCapture(e.pointerId);
  });
  titlebar.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const x = clamp(e.clientX - dragDX, -win.offsetWidth + 80, window.innerWidth - 80);
    const y = clamp(e.clientY - dragDY, 0, window.innerHeight - 40);
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
  });
  function stopDrag(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    try { titlebar.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
  titlebar.addEventListener("pointerup", stopDrag);
  titlebar.addEventListener("pointercancel", stopDrag);

  document.addEventListener("keydown", onEscape, true);

  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
    import("@xterm/xterm/css/xterm.css"),
  ]);

  if (!terminalOpen) return; // closed again before the chunk finished loading

  const term = new Terminal({
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    lineHeight: 1.25,
    cursorBlink: true,
    cursorStyle: "block",
    scrollback: 2000,
    convertEol: true,
    theme: {
      background: "#060806",
      foreground: "#4dff88",
      cursor: "#4dff88",
      cursorAccent: "#060806",
      selectionBackground: "rgba(77,255,136,0.28)",
      black: "#060806",
      red: "#ff6b6b",
      green: "#4dff88",
      yellow: "#ffbd2e",
      blue: "#7ab8ff",
      magenta: "#c792ff",
      cyan: "#63e8d4",
      white: "#d6f5df",
      brightGreen: "#8dffab",
      brightBlue: "#8dc4ff",
    },
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const bodyEl = win.querySelector<HTMLElement>("#term-body")!;
  term.open(bodyEl);
  fitAddon.fit();

  termEl = term;
  fitAddonEl = fitAddon;

  setupShell(term, close);
  term.focus();
}

export function initTerminalEasterEgg(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "`") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    void openTerminal();
  });
}
