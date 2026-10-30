// Markdown the site gets from Hugo's Goldmark settings (hugo.yaml) that
// plain marked doesn't know, shared by the preview and the LaTeX export:
//   ==mark==  ++inserted++  x^2^       inline extras
//   Term / : Definition                 definition lists
//   > [!NOTE] Title                      GitHub-style alerts (→ callout)
//   {.class} on its own line             block attributes (dropped here)
//   \( \) and \[ \]                       math delimiters (→ $ and $$)

import type { MarkedExtension, Tokens } from "marked";
import { normalizeMath } from "./math";

/** Applies `fn` to the text outside fenced code blocks and inline code. */
function outsideCode(src: string, fn: (text: string) => string): string {
  return src
    .split(/(^```[\s\S]*?^```[^\n]*$|`[^`\n]+`)/m)
    .map((part, i) => (i % 2 ? part : fn(part)))
    .join("");
}

const ALERT_TYPES = ["note", "tip", "important", "warning", "caution"];

export function preprocess(src: string): string {
  return outsideCode(normalizeMath(src), (text) =>
    text
      // > [!NOTE] Optional title, then more "> " lines → callout shortcode.
      .replace(/^> \[!(\w+)\][ \t]*(.*)\n((?:>.*(?:\n|$))*)/gim, (all, type: string, title: string, rest: string) => {
        if (!ALERT_TYPES.includes(type.toLowerCase())) return all;
        const body = rest.replace(/^> ?/gm, "").replace(/\n+$/, "");
        const t = title.trim().replace(/"/g, "'");
        return `{{< callout type="${type.toLowerCase()}"${t ? ` title="${t}"` : ""} >}}\n${body}\n{{< /callout >}}\n`;
      })
      .replace(/^\{[.#][^}\n]*\}[ \t]*$/gm, ""),
  );
}

function inlineWrap(name: string, delim: string, tag: string): NonNullable<MarkedExtension["extensions"]>[number] {
  const d = delim.replace(/[+^]/g, "\\$&");
  const re = new RegExp(`^${d}(?=\\S)([^\\n]*?\\S)${d}`);
  return {
    name,
    level: "inline",
    start: (src: string) => src.indexOf(delim),
    tokenizer(this: { lexer: { inlineTokens(s: string): Tokens.Generic[] } }, src: string) {
      const m = re.exec(src);
      if (!m) return undefined;
      return { type: name, raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
    },
    renderer(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Generic) {
      return `<${tag}>${this.parser.parseInline(token.tokens ?? [])}</${tag}>`;
    },
  };
}

const deflist: NonNullable<MarkedExtension["extensions"]>[number] = {
  name: "deflist",
  level: "block",
  start: (src: string) => src.match(/^[^\n]+\n: /m)?.index,
  tokenizer(this: { lexer: { inlineTokens(s: string): Tokens.Generic[] } }, src: string) {
    const m = /^((?:[^\n]+\n(?:: [^\n]*(?:\n|$))+)+)/.exec(src);
    if (!m) return undefined;
    const items: { term: Tokens.Generic[]; defs: Tokens.Generic[][] }[] = [];
    for (const line of m[1].split("\n").filter(Boolean)) {
      if (line.startsWith(": ")) items[items.length - 1]?.defs.push(this.lexer.inlineTokens(line.slice(2)));
      else items.push({ term: this.lexer.inlineTokens(line), defs: [] });
    }
    return { type: "deflist", raw: m[0], items };
  },
  renderer(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Generic) {
    const items = token.items as { term: Tokens.Generic[]; defs: Tokens.Generic[][] }[];
    return `<dl>${items.map((it) => `<dt>${this.parser.parseInline(it.term)}</dt>${it.defs.map((d) => `<dd>${this.parser.parseInline(d)}</dd>`).join("")}`).join("")}</dl>`;
  },
};

export const extrasExtension: MarkedExtension = {
  extensions: [inlineWrap("mark", "==", "mark"), inlineWrap("ins", "++", "ins"), inlineWrap("sup", "^", "sup"), deflist],
};
