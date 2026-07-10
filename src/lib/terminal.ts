// Easter egg: press ` (backtick) anywhere on the page (nothing editable
// focused) and a real terminal overlay drops down, mounted globally so
// it's available on every page. The headline command is `resume` — it
// prints the actual résumé data (src/data/resume.ts), plain-text
// formatted, right there in the terminal, not a placeholder.

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

let outputEl: HTMLElement;
let inputEl: HTMLInputElement;
let history: string[] = [];
let historyIndex = -1;

function print(text: string, cls = ""): void {
  const line = document.createElement("div");
  line.className = `term-line ${cls}`;
  line.textContent = text;
  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function printBlock(text: string): void {
  text.split("\n").forEach((l) => print(l || " "));
}

function runCommand(raw: string, close: () => void): void {
  const trimmed = raw.trim();
  print(`guest@priyanshu-portfolio:~$ ${raw}`, "term-echo");
  if (!trimmed) return;

  const [cmd, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(" ").toLowerCase();

  switch (cmd.toLowerCase()) {
    case "help":
      printBlock(HELP_TEXT);
      break;
    case "whoami":
      print("guest");
      print(`(you're looking at ${resume.name}'s site — type 'resume' to see it all)`);
      break;
    case "resume":
      printBlock(formatResume());
      break;
    case "ls":
      printBlock(Object.keys(FILES).join("   "));
      break;
    case "cat": {
      const key = arg.replace(/\.txt$/, "") + ".txt";
      const fn = FILES[key] ?? FILES[arg];
      if (fn) printBlock(fn());
      else print(`cat: ${arg || "(missing file)"}: No such file`, "term-err");
      break;
    }
    case "cd":
    case "open": {
      const route = ROUTES[arg];
      if (route) {
        print(`Navigating to ${route === "/" ? "home" : arg}…`);
        setTimeout(() => { location.hash = "#" + route; close(); }, 250);
      } else {
        print(`cd: ${arg || "(missing page)"}: no such page — try: home, about, projects, skills, blog`, "term-err");
      }
      break;
    }
    case "sudo":
      print("guest is not in the sudoers file. This incident will be reported.", "term-err");
      break;
    case "clear":
      outputEl.innerHTML = "";
      break;
    case "exit":
      close();
      break;
    default:
      print(`command not found: ${cmd} — type 'help' for a list of commands`, "term-err");
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
      background: #0b0d0c;
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
      display: flex; flex-direction: column;
      overflow: hidden;
      font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
      animation: term-pop-in 0.14s ease;
      z-index: 100000;
      min-width: 280px;
    }
    .term-window.term-maximized {
      left: 0.75rem !important; top: 0.75rem !important;
      width: calc(100vw - 1.5rem) !important; height: calc(100vh - 1.5rem) !important;
    }
    .term-window.term-minimized {
      height: auto !important; width: 260px !important;
    }
    .term-window.term-minimized .term-body,
    .term-window.term-minimized .term-inputrow { display: none; }
    .term-titlebar {
      display: flex; align-items: center; gap: 0.4rem;
      padding: 0.55rem 0.7rem;
      background: #1c1f1e;
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
    .term-dot:focus-visible { outline: 2px solid #7be08a; outline-offset: 2px; }
    .term-dot-red { background: #ff5f56; }
    .term-dot-yellow { background: #ffbd2e; }
    .term-dot-green { background: #27c93f; }
    .term-title { flex: 1; text-align: center; font-size: 0.78em; color: #8a8f8c; margin-right: 2.4rem; pointer-events: none; }
    .term-body { flex: 1; overflow-y: auto; padding: 0.8rem 0.9rem; font-size: 0.86em; line-height: 1.5; }
    .term-line { color: #d6f5df; white-space: pre-wrap; word-break: break-word; }
    .term-echo { color: #7be08a; font-weight: 600; }
    .term-err { color: #ff8a8a; }
    .term-inputrow { display: flex; align-items: center; padding: 0 0.9rem 0.8rem; gap: 0.4rem; }
    .term-prompt { color: #7be08a; font-size: 0.86em; white-space: nowrap; }
    .term-input {
      flex: 1; background: transparent; border: none; outline: none;
      color: #d6f5df; font-family: inherit; font-size: 0.86em; caret-color: #7be08a;
    }
    @keyframes term-pop-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
  `;
  document.head.appendChild(style);
}

let terminalOpen = false;
let winEl: HTMLDivElement | null = null;
let winState: "normal" | "minimized" | "maximized" = "normal";

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function openTerminal(): void {
  if (terminalOpen) {
    if (winState === "minimized" && winEl) {
      winEl.classList.remove("term-minimized");
      winState = "normal";
    }
    inputEl?.focus();
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
    <div class="term-body" id="term-body"></div>
    <div class="term-inputrow">
      <span class="term-prompt">guest@priyanshu-portfolio:~$</span>
      <input class="term-input" id="term-input" autocomplete="off" spellcheck="false" />
    </div>`;

  const width = Math.min(window.innerWidth - 32, 720);
  const height = Math.min(window.innerHeight * 0.65, 512);
  win.style.width = `${width}px`;
  win.style.height = `${height}px`;
  win.style.left = `${Math.max(16, (window.innerWidth - width) / 2)}px`;
  win.style.top = `${Math.max(16, (window.innerHeight - height) / 2)}px`;

  document.body.appendChild(win);
  winEl = win;

  outputEl = win.querySelector<HTMLElement>("#term-body")!;
  inputEl = win.querySelector<HTMLInputElement>("#term-input")!;
  history = [];
  historyIndex = -1;

  const titlebar = win.querySelector<HTMLElement>(".term-titlebar")!;
  const dotClose = win.querySelector<HTMLButtonElement>(".term-dot-red")!;
  const dotMin = win.querySelector<HTMLButtonElement>(".term-dot-yellow")!;
  const dotMax = win.querySelector<HTMLButtonElement>(".term-dot-green")!;

  function close(): void {
    document.removeEventListener("keydown", onEscape, true);
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
  }

  function setMaximized(on: boolean): void {
    winState = on ? "maximized" : "normal";
    win.classList.toggle("term-maximized", on);
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

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = inputEl.value;
      history.push(val);
      historyIndex = history.length;
      inputEl.value = "";
      runCommand(val, close);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) { historyIndex--; inputEl.value = history[historyIndex] ?? ""; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < history.length - 1) { historyIndex++; inputEl.value = history[historyIndex] ?? ""; }
      else { historyIndex = history.length; inputEl.value = ""; }
    }
  });

  document.addEventListener("keydown", onEscape, true);

  print(`Welcome to ${resume.name}'s terminal.`);
  print("Type 'resume' to see the full résumé, or 'help' for more.");
  print("");
  inputEl.focus();
}

export function initTerminalEasterEgg(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "`") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    openTerminal();
  });
}
