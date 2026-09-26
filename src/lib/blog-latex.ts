// Markdown → LaTeX for a blog post, used by the admin "LaTeX export" panel.
// The output is a complete pdfLaTeX document meant to be pasted into
// Overleaf as-is; the compiled PDF is then uploaded back from admin.
//
// Conversion rules (keep in sync with the help text in admin-blog-editor.ts):
//   ## / ###            → \section / \subsection (#### and deeper → \paragraph)
//   **b** *i* `code`    → \textbf / \emph / \texttt
//   [text](url)         → \href (site-relative links become absolute)
//   ![alt](path)        → figure + \includegraphics{<file name>}; the file must
//                         be uploaded to the Overleaf project (listed in `images`)
//   $..$ / $$..$$       → inline / display math, passed through verbatim
//   ```lang             → listings block (C++, C, Python, Java, SQL, Bash styled)
//   lists, quotes, tables, --- → itemize/enumerate, quote box, booktabs, rule
//   :::note/tip/warning/important, :::spoiler → titled boxes (spoilers printed open)
//   :::tabs             → each code block, captioned with its tab label
//   :::problem          → problem card box
//   :::testcases        → input/expected listings, truncated, large cases linked
//   :::youtube, :::binviz → a link to the online version
//   Raw HTML is dropped; characters pdfLaTeX can't typeset (emoji etc.) are
//   removed and reported in `warnings`.

import { Marked, type Token, type Tokens } from "marked";
import markedKatex from "marked-katex-extension";

export interface LatexPostMeta {
  slug: string;
  title: string;
  date?: string;
  updated?: string;
  tags?: string[];
  excerpt?: string;
  author?: string;
  siteOrigin?: string;
}

export interface LatexExport {
  tex: string;
  /** Image paths (site-relative) the document references, to upload to Overleaf. */
  images: { src: string; file: string }[];
  warnings: string[];
}

// ─── Block extensions (tokenizers only — rendering happens in the walker) ───

type BlockTok = Tokens.Generic & { tokens?: Token[] };
type Lexer = { lexer: { blockTokens: (s: string, t: Token[]) => void } };

function fenced(name: string, withBody: boolean) {
  const re = new RegExp(`^:::${name}\\b([^\\n]*)\\n([\\s\\S]*?)\\n:::(?:\\n|$)`);
  return {
    name: `x-${name}`,
    level: "block" as const,
    start(src: string) {
      const i = src.indexOf(`:::${name}`);
      return i === -1 ? undefined : i;
    },
    tokenizer(this: Lexer, src: string) {
      const m = re.exec(src);
      if (!m) return undefined;
      const tok: BlockTok = { type: `x-${name}`, raw: m[0], arg: m[1].trim(), body: m[2], tokens: [] };
      if (withBody) this.lexer.blockTokens(m[2], tok.tokens!);
      return tok;
    },
  };
}

const youtube = {
  name: "x-youtube",
  level: "block" as const,
  start(src: string) {
    const i = src.indexOf(":::youtube");
    return i === -1 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^:::youtube[ \t]+(\S+)[ \t]*\n?:::(?:\n|$)/.exec(src);
    return m ? { type: "x-youtube", raw: m[0], arg: m[1] } : undefined;
  },
};

const md = new Marked({ gfm: true });
md.use({
  extensions: [
    fenced("spoiler", true),
    fenced("note", true),
    fenced("tip", true),
    fenced("warning", true),
    fenced("important", true),
    fenced("tabs", true),
    fenced("problem", false),
    fenced("testcases", false),
    fenced("binviz", false),
    youtube,
  ],
});
md.use(markedKatex({ throwOnError: false, nonStandard: true }));

// ─── Escaping ───────────────────────────────────────────────────────────────

const TEXT_MAP: Record<string, string> = {
  "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#",
  "%": "\\%", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}",
  "<": "\\textless{}", ">": "\\textgreater{}", "|": "\\textbar{}",
  "—": "---", "–": "--", "…": "\\ldots{}", "“": "``", "”": "''",
  "‘": "`", "’": "'", " ": "~", "→": "$\\rightarrow$", "←": "$\\leftarrow$",
  "↔": "$\\leftrightarrow$", "⇒": "$\\Rightarrow$", "≤": "$\\le$", "≥": "$\\ge$",
  "≠": "$\\ne$", "×": "$\\times$", "·": "$\\cdot$", "•": "\\textbullet{}",
  "∞": "$\\infty$", "≈": "$\\approx$", "±": "$\\pm$", "−": "$-$",
  "✓": "$\\checkmark$", "°": "$^\\circ$",
};

/** listings can't take multi-byte UTF-8 under pdfLaTeX, so code gets ASCII stand-ins. */
const CODE_MAP: Record<string, string> = {
  "—": "--", "–": "-", "…": "...", "“": '"', "”": '"', "‘": "'", "’": "'",
  "→": "->", "←": "<-", "⇒": "=>", "≤": "<=", "≥": ">=", "≠": "!=",
  "×": "x", "·": ".", "•": "*", " ": " ", "−": "-",
};

class Ctx {
  images: { src: string; file: string }[] = [];
  warnings = new Set<string>();
  meta: Required<Pick<LatexPostMeta, "slug" | "siteOrigin">>;
  constructor(meta: Required<Pick<LatexPostMeta, "slug" | "siteOrigin">>) {
    this.meta = meta;
  }

  text(s: string): string {
    let out = "";
    for (const ch of s) {
      if (TEXT_MAP[ch] !== undefined) out += TEXT_MAP[ch];
      else if (/[\x20-\x7e\n\t]/.test(ch) || /[¡-ÿĀ-ſ]/.test(ch)) out += ch;
      else this.warnings.add(`Removed a character pdfLaTeX can't typeset: "${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}).`);
    }
    return out;
  }

  code(s: string): string {
    let out = "";
    for (const ch of s) {
      if (CODE_MAP[ch] !== undefined) out += CODE_MAP[ch];
      else if (/[\x09\x0a\x20-\x7e]/.test(ch)) out += ch;
      else {
        this.warnings.add(`Replaced a non-ASCII character in a code block with "?": "${ch}".`);
        out += "?";
      }
    }
    // A literal \end{lstlisting} inside code would close the environment early.
    return out.replace(/\\end\{lstlisting\}/g, "\\end {lstlisting}");
  }

  url(href: string): string {
    const abs = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")
      ? href
      : `${this.meta.siteOrigin}/${href.replace(/^\//, "")}`;
    return abs.replace(/\\/g, "/").replace(/([#%])/g, "\\$1");
  }

  postUrl(): string {
    return `${this.meta.siteOrigin}/blog/${encodeURIComponent(this.meta.slug)}/`;
  }
}

// ─── Inline ─────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function inline(tokens: Token[] | undefined, c: Ctx): string {
  if (!tokens) return "";
  return tokens.map((t) => inlineOne(t, c)).join("");
}

function inlineOne(t: Token, c: Ctx): string {
  const g = t as Tokens.Generic;
  switch (t.type) {
    case "text":
      return g.tokens ? inline(g.tokens, c) : c.text(decodeEntities(g.text));
    case "escape":
      return c.text(decodeEntities(g.text));
    case "strong":
      return `\\textbf{${inline(g.tokens, c)}}`;
    case "em":
      return `\\emph{${inline(g.tokens, c)}}`;
    case "del":
      return inline(g.tokens, c);
    case "codespan":
      return `\\texttt{${c.text(decodeEntities(g.text))}}`;
    case "br":
      return "\\\\\n";
    case "link": {
      const body = inline(g.tokens, c);
      return `\\href{${c.url(g.href)}}{${body}}`;
    }
    case "image":
      return imageLatex(g.href, g.text, c, true);
    case "inlineKatex":
      return g.displayMode ? `\n\\[\n${g.text.trim()}\n\\]\n` : `$${g.text.trim()}$`;
    case "html":
      return "";
    default:
      return g.text ? c.text(decodeEntities(g.text)) : "";
  }
}

function imageLatex(href: string, alt: string, c: Ctx, inlineCtx: boolean): string {
  if (/^https?:/i.test(href)) {
    c.warnings.add(`External image not embedded (download it and add it by hand): ${href}`);
    return alt ? `\\emph{[Image: ${c.text(alt)}]}` : "";
  }
  const src = href.replace(/^\//, "");
  const file = decodeURIComponent(src.split("/").pop() || src);
  if (!/\.(png|jpe?g|pdf)$/i.test(file)) {
    c.warnings.add(`"${file}" is not PNG/JPG/PDF — convert it before uploading to Overleaf.`);
  }
  if (/[#%&{}\\]/.test(file)) {
    c.warnings.add(`Rename "${file}" (in Overleaf and in the .tex) — # % & { } \\ in file names break LaTeX.`);
  }
  if (!c.images.some((i) => i.src === src)) c.images.push({ src, file });
  const fig = [
    "\\begin{figure}[htbp]",
    "\\centering",
    `\\includegraphics[width=0.9\\linewidth,height=0.45\\textheight,keepaspectratio]{${file}}`,
    alt ? `\\caption*{${c.text(alt)}}` : "",
    "\\end{figure}",
  ].filter(Boolean).join("\n");
  return inlineCtx ? `\n${fig}\n` : fig;
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

const LISTINGS_LANG: Record<string, string> = {
  cpp: "C++", "c++": "C++", c: "C", python: "Python", py: "Python", java: "Java",
  sql: "SQL", bash: "bash", sh: "bash", shell: "bash",
};

function codeBlock(text: string, lang: string | undefined, c: Ctx, title?: string): string {
  const parts = (lang || "").trim().split(/\s+/);
  const language = LISTINGS_LANG[(parts[0] || "").toLowerCase()];
  const opts = [language ? `language=${language}` : "", title ? `title={${c.text(title)}}` : ""].filter(Boolean).join(", ");
  return `\\begin{lstlisting}${opts ? `[${opts}]` : ""}\n${c.code(text)}\n\\end{lstlisting}`;
}

function box(kind: string, title: string, body: string): string {
  return `\\begin{${kind}}{${title}}\n${body}\n\\end{${kind}}`;
}

function truncate(s: string, maxLines = 8, maxChars = 400): { text: string; cut: boolean } {
  let text = s.replace(/\n$/, "");
  let cut = false;
  const lines = text.split("\n");
  if (lines.length > maxLines) {
    text = lines.slice(0, maxLines).join("\n");
    cut = true;
  }
  text = text.split("\n").map((l) => (l.length > 90 ? `${l.slice(0, 90)} ...` : l)).join("\n");
  if (/ \.\.\.$/m.test(text)) cut = true;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    cut = true;
  }
  return { text, cut };
}

function testcasesLatex(json: string, c: Ctx): string {
  let cases: { name?: string; input?: string; expected?: string; inputUrl?: string; expectedUrl?: string }[];
  try {
    cases = JSON.parse(json);
    if (!Array.isArray(cases)) throw new Error();
  } catch {
    c.warnings.add("A :::testcases block has invalid JSON and was skipped.");
    return "";
  }
  const parts = cases.map((tc, i) => {
    const name = c.text(tc.name || `Test ${i + 1}`);
    const field = (label: string, value: string | undefined, url: string | undefined) => {
      if (url) return `\\textit{${label}:} \\href{${c.url(url)}}{download (large file)}\\par`;
      const { text, cut } = truncate(value ?? "");
      return `\\textit{${label}${cut ? " (truncated)" : ""}:}\n\\begin{lstlisting}[style=plain]\n${c.code(text || " ")}\n\\end{lstlisting}`;
    };
    return `\\textbf{${name}}\\par\\smallskip\n${field("Input", tc.input, tc.inputUrl)}\n${field("Expected output", tc.expected, tc.expectedUrl)}`;
  });
  return box("notebox", "Test cases", `${parts.join("\n\\medskip\n")}\n\\par\\smallskip\\footnotesize Run them in the browser at \\url{${c.postUrl()}}.`);
}

function problemLatex(body: string, c: Ctx): string {
  const f: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) f[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  const title = c.text(f.title || "Problem");
  const head = f.url && /^https?:\/\//.test(f.url) ? `\\href{${c.url(f.url)}}{${title}}` : title;
  const meta = [f.source, f.limits].filter(Boolean).map((x) => c.text(x!)).join(" \\quad\\textperiodcentered\\quad ");
  const tags = (f.tags || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => c.text(x)).join(", ");
  return [
    "\\begin{problembox}",
    `{\\large\\bfseries ${head}}${f.rating ? `\\hfill\\texttt{${c.text(f.rating)}}` : ""}\\par`,
    meta ? `\\smallskip{\\small\\color{muted} ${meta}}\\par` : "",
    tags ? `\\smallskip{\\footnotesize\\ttfamily ${tags}}` : "",
    "\\end{problembox}",
  ].filter(Boolean).join("\n");
}

function tableLatex(t: Tokens.Table, c: Ctx): string {
  const cols = t.header.map((_, i) => {
    const a = t.align[i];
    const cmd = a === "center" ? "\\centering" : a === "right" ? "\\raggedleft" : "\\raggedright";
    return `>{${cmd}\\arraybackslash}X`;
  });
  const row = (cells: Tokens.TableCell[], bold: boolean) =>
    cells.map((cell) => (bold ? `\\textbf{${inline(cell.tokens, c)}}` : inline(cell.tokens, c))).join(" & ") + " \\\\";
  return [
    "\\begin{center}\\small",
    `\\begin{tabularx}{\\linewidth}{${cols.join("")}}`,
    "\\toprule",
    row(t.header, true),
    "\\midrule",
    ...t.rows.map((r) => row(r, false)),
    "\\bottomrule",
    "\\end{tabularx}",
    "\\end{center}",
  ].join("\n");
}

function listLatex(t: Tokens.List, c: Ctx): string {
  const env = t.ordered ? "enumerate" : "itemize";
  const start = t.ordered && typeof t.start === "number" && t.start !== 1 ? `[start=${t.start}]` : "";
  const items = t.items.map((it) => `\\item ${blocks(it.tokens, c).trim()}`).join("\n");
  return `\\begin{${env}}${start}\n${items}\n\\end{${env}}`;
}

function blocks(tokens: Token[] | undefined, c: Ctx): string {
  if (!tokens) return "";
  return tokens.map((t) => block(t, c)).filter((s) => s !== "").join("\n\n");
}

function block(t: Token, c: Ctx): string {
  const g = t as BlockTok;
  switch (t.type) {
    case "space":
    case "html":
      return "";
    case "heading": {
      const cmd = g.depth <= 2 ? "section" : g.depth === 3 ? "subsection" : "paragraph";
      return `\\${cmd}{${inline(g.tokens, c)}}`;
    }
    case "paragraph": {
      // A paragraph that is only an image becomes a figure, not inline text.
      const only = g.tokens?.length === 1 && g.tokens[0].type === "image" ? (g.tokens[0] as Tokens.Image) : null;
      return only ? imageLatex(only.href, only.text, c, false) : inline(g.tokens, c);
    }
    case "text":
      return g.tokens ? inline(g.tokens, c) : c.text(decodeEntities(g.text));
    case "code":
      return codeBlock(g.text, g.lang, c);
    case "blockquote":
      return `\\begin{quotebox}\n${blocks(g.tokens, c)}\n\\end{quotebox}`;
    case "list":
      return listLatex(t as Tokens.List, c);
    case "table":
      return tableLatex(t as Tokens.Table, c);
    case "hr":
      return "\\par\\medskip\\noindent\\rule{\\linewidth}{0.4pt}\\par\\medskip";
    case "blockKatex":
      return `\\[\n${g.text.trim()}\n\\]`;
    case "x-spoiler":
      return box("notebox", c.text(g.arg || "Hint"), blocks(g.tokens, c));
    case "x-note":
      return box("notebox", c.text(g.arg || "Note"), blocks(g.tokens, c));
    case "x-important":
      return box("notebox", c.text(g.arg || "Important"), blocks(g.tokens, c));
    case "x-tip":
      return box("tipbox", c.text(g.arg || "Tip"), blocks(g.tokens, c));
    case "x-warning":
      return box("warnbox", c.text(g.arg || "Warning"), blocks(g.tokens, c));
    case "x-tabs":
      return (g.tokens ?? [])
        .map((tok) => {
          if (tok.type !== "code") return block(tok, c);
          const parts = ((tok as Tokens.Code).lang || "").trim().split(/\s+/);
          const label = parts.find((p) => p.startsWith("label="))?.slice(6).replace(/_/g, " ") ?? LISTINGS_LANG[parts[0]?.toLowerCase()] ?? parts[0];
          return codeBlock((tok as Tokens.Code).text, (tok as Tokens.Code).lang, c, label);
        })
        .filter(Boolean)
        .join("\n\n");
    case "x-problem":
      return problemLatex(g.body, c);
    case "x-testcases":
      return testcasesLatex(g.body, c);
    case "x-youtube": {
      const m = String(g.arg).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
      const url = `https://youtu.be/${m ? m[1] : g.arg}`;
      return `\\noindent\\textit{Video:} \\url{${c.url(url)}}`;
    }
    case "x-binviz":
      return `\\noindent\\textit{An interactive visualization is available in the online version:} \\url{${c.postUrl()}}`;
    default:
      return g.tokens ? blocks(g.tokens, c) : g.text ? c.text(decodeEntities(g.text)) : "";
  }
}

// ─── Document ───────────────────────────────────────────────────────────────

const PREAMBLE = String.raw`\documentclass[11pt,a4paper]{article}

% ── Fonts & encoding (compile with pdfLaTeX) ───────────────────────────────
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage[scaled=0.95]{inconsolata}
\usepackage{microtype}

% ── Layout ────────────────────────────────────────────────────────────────
\usepackage[a4paper,margin=2.4cm,headheight=22pt]{geometry}
\usepackage{parskip}
\usepackage{enumitem}
\setlist{itemsep=0.25em,topsep=0.4em}

% ── Math, tables, figures ─────────────────────────────────────────────────
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{caption}
\usepackage{booktabs,tabularx,array}

% ── Colour, boxes, code ───────────────────────────────────────────────────
\usepackage[dvipsnames]{xcolor}
\definecolor{ink}{HTML}{18181B}
\definecolor{muted}{HTML}{71717A}
\definecolor{rule}{HTML}{D4D4D8}
\definecolor{codebg}{HTML}{F7F7F8}
\definecolor{accent}{HTML}{0B57D0}
\definecolor{okgreen}{HTML}{15803D}
\definecolor{warnred}{HTML}{B91C1C}
\usepackage[most]{tcolorbox}
\usepackage{listings}

\lstset{
  basicstyle=\ttfamily\small,
  keywordstyle=\color{accent}\bfseries,
  commentstyle=\color{muted},
  stringstyle=\color{okgreen},
  numberstyle=\tiny\color{muted},
  numbers=left, numbersep=8pt, xleftmargin=18pt,
  backgroundcolor=\color{codebg},
  frame=single, rulecolor=\color{rule}, framesep=5pt,
  breaklines=true, breakatwhitespace=false, postbreak=\mbox{\textcolor{muted}{$\hookrightarrow$}\space},
  columns=fullflexible, keepspaces=true, showstringspaces=false, tabsize=4,
  upquote=true, aboveskip=0.8em, belowskip=0.8em,
  captionpos=t,
}
\lstdefinestyle{plain}{numbers=none, xleftmargin=0pt, keywordstyle=, commentstyle=, stringstyle=, basicstyle=\ttfamily\footnotesize}

\newtcolorbox{notebox}[1]{enhanced, breakable, colback=white, colframe=rule, boxrule=0.5pt,
  borderline west={2pt}{0pt}{ink}, arc=2pt, left=10pt, right=10pt, top=6pt, bottom=6pt,
  fonttitle=\ttfamily\small\bfseries, coltitle=ink, colbacktitle=white, title={#1},
  attach title to upper, after title={\par\smallskip}}
\newtcolorbox{tipbox}[1]{enhanced, breakable, colback=white, colframe=rule, boxrule=0.5pt,
  borderline west={2pt}{0pt}{okgreen}, arc=2pt, left=10pt, right=10pt, top=6pt, bottom=6pt,
  fonttitle=\ttfamily\small\bfseries, coltitle=okgreen, title={#1},
  attach title to upper, after title={\par\smallskip}}
\newtcolorbox{warnbox}[1]{enhanced, breakable, colback=warnred!4, colframe=warnred!35, boxrule=0.5pt,
  borderline west={2pt}{0pt}{warnred}, arc=2pt, left=10pt, right=10pt, top=6pt, bottom=6pt,
  fonttitle=\ttfamily\small\bfseries, coltitle=warnred, title={#1},
  attach title to upper, after title={\par\smallskip}}
\newtcolorbox{quotebox}{enhanced, breakable, frame hidden, colback=white, boxrule=0pt,
  borderline west={1.5pt}{0pt}{rule}, left=12pt, right=0pt, top=2pt, bottom=2pt, fontupper=\itshape\color{ink!85}}
\newtcolorbox{problembox}{enhanced, colback=codebg, colframe=rule, boxrule=0.5pt, arc=3pt,
  left=12pt, right=12pt, top=8pt, bottom=8pt}

% ── Headings, header/footer, links ────────────────────────────────────────
\usepackage{titlesec}
\titleformat{\section}{\large\bfseries\color{ink}}{\thesection}{0.8em}{}
\titleformat{\subsection}{\normalsize\bfseries\color{ink}}{\thesubsection}{0.8em}{}
\titlespacing*{\section}{0pt}{1.6em}{0.5em}
\titlespacing*{\subsection}{0pt}{1.2em}{0.4em}
\usepackage{fancyhdr}
\usepackage{lastpage}
\usepackage{hyperref}
\hypersetup{colorlinks=true, linkcolor=ink, urlcolor=accent, citecolor=ink}
\urlstyle{tt}
\usepackage{xurl}
\setlength{\emergencystretch}{3em}
`;

export function blogToLatex(markdown: string, meta: LatexPostMeta): LatexExport {
  const siteOrigin = meta.siteOrigin ?? "https://priyanshudebnath.me";
  const c = new Ctx({ slug: meta.slug, siteOrigin });
  const body = blocks(md.lexer(markdown), c);
  const author = meta.author ?? "Priyanshu Debnath";
  const url = c.postUrl();
  const dateLine = [meta.date && `Published ${c.text(meta.date)}`, meta.updated && `Updated ${c.text(meta.updated)}`]
    .filter(Boolean)
    .join(" \\quad\\textperiodcentered\\quad ");
  const tags = (meta.tags ?? []).map((t) => c.text(t)).join(" \\textperiodcentered{} ");
  const shortTitle = meta.title.length > 60 ? `${meta.title.slice(0, 57)}...` : meta.title;

  const titleBlock = [
    "\\begin{flushleft}",
    tags ? `{\\footnotesize\\ttfamily\\color{muted} ${tags}}\\par\\smallskip` : "",
    `{\\LARGE\\bfseries\\color{ink} ${c.text(meta.title)}\\par}`,
    "\\medskip",
    `{\\small ${c.text(author)}\\quad\\textperiodcentered\\quad \\href{${c.url(url)}}{\\texttt{${c.text(url.replace(/^https?:\/\//, ""))}}}}\\par`,
    dateLine ? `{\\small\\color{muted} ${dateLine}}\\par` : "",
    "\\end{flushleft}",
    meta.excerpt ? `\\begin{quotebox}\n${c.text(meta.excerpt)}\n\\end{quotebox}` : "",
    "\\noindent{\\color{rule}\\rule{\\linewidth}{0.5pt}}",
  ].filter(Boolean).join("\n");

  const tex = `% Generated from ${url}
% Compile with pdfLaTeX (Overleaf default). Upload the images listed in the admin panel.
${PREAMBLE}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\footnotesize\\color{muted} ${c.text(shortTitle)}}
\\fancyhead[R]{\\footnotesize\\color{muted} ${c.text(author)}}
\\fancyfoot[L]{\\footnotesize\\color{muted}\\texttt{${c.text(siteOrigin.replace(/^https?:\/\//, ""))}}}
\\fancyfoot[R]{\\footnotesize\\color{muted} \\thepage\\,/\\,\\pageref*{LastPage}}
\\fancypagestyle{plain}{\\fancyhf{}\\fancyfoot[L]{\\footnotesize\\color{muted}\\texttt{${c.text(siteOrigin.replace(/^https?:\/\//, ""))}}}\\fancyfoot[R]{\\footnotesize\\color{muted} \\thepage\\,/\\,\\pageref*{LastPage}}\\renewcommand{\\headrulewidth}{0pt}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{rule}\\leaders\\hrule height \\headrulewidth\\hfill}}
\\hypersetup{pdftitle={${c.text(meta.title)}}, pdfauthor={${c.text(author)}}}

\\begin{document}
\\thispagestyle{plain}
${titleBlock}

${body}

\\vfill
\\noindent{\\footnotesize\\color{muted} Read online, with runnable code: \\url{${c.url(url)}}}
\\end{document}
`;
  return { tex, images: c.images, warnings: [...c.warnings] };
}
