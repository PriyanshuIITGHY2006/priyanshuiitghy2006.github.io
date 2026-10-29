// "How do I write this" reference shown above the post editor. Documents
// what the Hugo site actually supports (layouts/_markup, layouts/_shortcodes
// and PaperMod's built-ins). Update it when those change.

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function example(code: string): string {
  return `<pre class="help-example"><code>${esc(code)}</code></pre>`;
}

const SECTIONS: [string, string][] = [
  ["Markdown", `<p>Normal Markdown: <code>**bold**</code>, <code>*italic*</code>, lists, tables, <code>&gt; quotes</code>, <code>[text](https://...)</code>, <code>![alt](gallery-media/file.png)</code>. Use <code>##</code> and <code>###</code> for headings; the title is already the page heading.</p>`],
  ["Math", `<p>KaTeX: <code>$x^2$</code> inline, <code>$$ ... $$</code> on its own lines for display.</p>`],
  ["Code blocks", `<p>A language tag gives highlighting. Optional settings go in braces after it.</p>
    ${example('```cpp {title="main.cpp" numbers=true hl="2 4-6" add="3" del="5"}\nint main() {\n  return 0;\n}\n```')}
    <p>Markers at the end of a line also work: <code>// [!code ++]</code>, <code>// [!code --]</code>, <code>// [!code highlight]</code>, <code>// [!code word:foo]</code>.</p>`],
  ["Problem card", example('{{< problem title=`E. Two Arrays` source=`Codeforces Round 1102` rating=`2100` limits=`2 s · 256 MB` tags=`dp, math` >}}')],
  ["Collapsible section", example('{{< collapse summary=`Test cases` >}}\nHidden until opened. Markdown works inside.\n{{< /collapse >}}')],
  ["Callout", example('{{< callout type="note" title="Why this works" >}}\nText. Types: note, warning.\n{{< /callout >}}')],
  ["Diagram", `${example('{{< diagram name="idea" caption="How the split works" >}}')}<p>Draws <code>assets/diagrams/&lt;slug&gt;/idea.svg</code>. Add SVG files to the repo by hand.</p>`],
  ["GitHub", example('{{< repo-card repo="owner/name" title="Title" desc="One line" >}}\n{{< repo-code repo="owner/name" path="src/main.cpp" lines="10-30" >}}')],
  ["YouTube", example("{{< youtube dQw4w9WgXcQ >}}")],
];

export function renderWritingGuide(): string {
  return `
    <details class="help">
      <summary>Writing guide</summary>
      <div class="help-body">
        ${SECTIONS.map(([title, body]) => `<div class="help-section"><h4>${esc(title)}</h4>${body}</div>`).join("")}
      </div>
    </details>`;
}
