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
  home: "/", resume: "/", about: "/about", projects: "/projects", skills: "/skills",
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
    .term-backdrop {
      position: fixed; inset: 0; z-index: 100000;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      padding: 1.2rem;
      animation: term-fade-in 0.12s ease;
    }
    .term-window {
      width: 100%; max-width: 44rem; height: min(65vh, 32rem);
      background: #0b0d0c;
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      display: flex; flex-direction: column;
      overflow: hidden;
      font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
      animation: term-pop-in 0.14s ease;
    }
    .term-titlebar {
      display: flex; align-items: center; gap: 0.4rem;
      padding: 0.55rem 0.7rem;
      background: #1c1f1e;
    }
    .term-dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
    .term-dot-red { background: #ff5f56; }
    .term-dot-yellow { background: #ffbd2e; }
    .term-dot-green { background: #27c93f; }
    .term-title { flex: 1; text-align: center; font-size: 0.78em; color: #8a8f8c; margin-right: 2.4rem; }
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
    @keyframes term-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes term-pop-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
  `;
  document.head.appendChild(style);
}

let terminalOpen = false;

function openTerminal(): void {
  if (terminalOpen) return;
  terminalOpen = true;
  injectStyles();

  const backdrop = document.createElement("div");
  backdrop.className = "term-backdrop";
  backdrop.innerHTML = `
    <div class="term-window" role="dialog" aria-label="Terminal">
      <div class="term-titlebar">
        <span class="term-dot term-dot-red"></span>
        <span class="term-dot term-dot-yellow"></span>
        <span class="term-dot term-dot-green"></span>
        <span class="term-title">guest@priyanshu-portfolio: ~</span>
      </div>
      <div class="term-body" id="term-body"></div>
      <div class="term-inputrow">
        <span class="term-prompt">guest@priyanshu-portfolio:~$</span>
        <input class="term-input" id="term-input" autocomplete="off" spellcheck="false" />
      </div>
    </div>`;

  outputEl = backdrop.querySelector<HTMLElement>("#term-body")!;
  inputEl = backdrop.querySelector<HTMLInputElement>("#term-input")!;
  history = [];
  historyIndex = -1;

  function close(): void {
    document.removeEventListener("keydown", onEscape, true);
    backdrop.remove();
    terminalOpen = false;
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

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
  document.body.appendChild(backdrop);

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
