// Finds Hugo shortcodes in a post body, for the preview and the LaTeX
// export. Handles {{< name a="x" b=`y` >}}, paired {{< name >}}…{{< /name >}}
// (nested pairs of the same name too) and the {{% %}} form.

export interface Shortcode {
  name: string;
  params: Record<string, string>;
  /** Text between the opening and closing tags; undefined for a single tag. */
  inner?: string;
  start: number;
  end: number;
}

const TAG_RE = /\{\{([<%])\s*(\/?)([\w-]+)((?:\s+[\w-]+=(?:"[^"]*"|`[^`]*`|[^\s>%}]+))*)\s*\/?\s*[>%]\}\}/g;
const PARAM_RE = /([\w-]+)=(?:"([^"]*)"|`([^`]*)`|([^\s>%}]+))/g;

function parseParams(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(PARAM_RE)) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** Top-level shortcodes in `src`, in order. Inner text is left unparsed. */
export function findShortcodes(src: string): Shortcode[] {
  const tags = [...src.matchAll(TAG_RE)].map((m) => ({
    closing: m[2] === "/",
    name: m[3],
    params: m[4],
    start: m.index!,
    end: m.index! + m[0].length,
  }));
  const out: Shortcode[] = [];
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    if (t.closing) continue;
    // Look for the matching close, counting nested opens of the same name.
    let depth = 0;
    let close = -1;
    for (let j = i + 1; j < tags.length; j++) {
      if (tags[j].name !== t.name) continue;
      if (!tags[j].closing) depth++;
      else if (depth === 0) { close = j; break; }
      else depth--;
    }
    if (close === -1) {
      out.push({ name: t.name, params: parseParams(t.params), start: t.start, end: t.end });
      continue;
    }
    out.push({
      name: t.name,
      params: parseParams(t.params),
      inner: src.slice(t.end, tags[close].start).replace(/^\n/, "").replace(/\n$/, ""),
      start: t.start,
      end: tags[close].end,
    });
    i = close;
  }
  return out;
}

/** Replaces each top-level shortcode with `render(sc, index)`. */
export function replaceShortcodes(src: string, render: (sc: Shortcode, i: number) => string): string {
  let out = "";
  let pos = 0;
  findShortcodes(src).forEach((sc, i) => {
    out += src.slice(pos, sc.start) + render(sc, i);
    pos = sc.end;
  });
  return out + src.slice(pos);
}
