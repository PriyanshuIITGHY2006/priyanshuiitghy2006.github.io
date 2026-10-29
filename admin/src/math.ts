// Hugo's passthrough also accepts \( \) and \[ \] (hugo.yaml); marked's KaTeX
// extension only knows $ and $$. Rewrites the former to the latter, leaving
// code blocks and inline code alone.
export function normalizeMath(src: string): string {
  return src
    .split(/(^```[\s\S]*?^```[^\n]*$|`[^`\n]+`)/m)
    .map((part, i) => (i % 2 ? part : part
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`)))
    .join("");
}
