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
  ["Text", `<p><code>**bold**</code>, <code>*italic*</code>, <code>~~strike~~</code>, <code>==highlight==</code>, <code>++inserted++</code>, <code>x^2^</code> superscript, <code>H&lt;sub&gt;2&lt;/sub&gt;O</code> subscript, <code>\`code\`</code>, <code>[text](https://...)</code>, emoji like <code>:rocket:</code>. Quotes and dashes (<code>--</code>, <code>---</code>) become typographic.</p>`],
  ["Blocks", `<p><code>##</code>/<code>###</code> headings, lists, <code>- [ ]</code> task lists, <code>&gt; quotes</code>, tables (<code>:---:</code> to align), <code>---</code> rule, footnotes <code>[^1]</code>, definition lists:</p>${example("Term\n: Definition")}<p>Add a class or id on the line after a block: <code>{.lead}</code>, <code>{#anchor}</code>. Raw HTML works too.</p>`],
  ["Alerts", example("> [!NOTE]\n> Also [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION].\n> A title can follow the type: > [!TIP] Try this")],
  ["Math", `<p>KaTeX: <code>$x^2$</code> or <code>\\(x^2\\)</code> inline, <code>$$ ... $$</code> or <code>\\[ ... \\]</code> for display.</p>`],
  ["Images", `<p><code>![alt](gallery-media/file.png)</code> (resized and served as WebP), or a figure with a caption:</p>${example('{{< figure src="gallery-media/file.png" caption="Caption" align="center" width="400" link="https://..." >}}')}<p>Small image inside a sentence: <code>{{&lt; inTextImg url="gallery-media/icon.png" height="16" &gt;}}</code>. Use <b>Insert file…</b> above the editor to upload and insert in one step.</p>`],
  ["Video and audio", example('{{< video src="gallery-media/clip.mp4" poster="gallery-media/clip.png" caption="Caption" >}}\n{{< video src="gallery-media/loop.mp4" autoplay=true >}}   (silent loop, like a GIF)\n{{< audio src="gallery-media/talk.mp3" caption="Caption" >}}\n{{< youtube dQw4w9WgXcQ >}}\n{{< vimeo 55073825 >}}')],
  ["Code blocks", `<p>A language tag gives highlighting. Optional settings go in braces after it.</p>
    ${example('```cpp {title="main.cpp" numbers=true hl="2 4-6" add="3" del="5"}\nint main() {\n  return 0;\n}\n```')}
    <p>Markers at the end of a line also work: <code>// [!code ++]</code>, <code>// [!code --]</code>, <code>// [!code highlight]</code>, <code>// [!code word:foo]</code>. Hugo's own form: <code>{{&lt; highlight go "linenos=table,hl_lines=2 4" &gt;}}...{{&lt; /highlight &gt;}}</code>.</p>`],
  ["Diagrams", `${example("```mermaid\nflowchart LR\n  A[Input] --> B{Split?}\n  B -->|yes| C[Recurse]\n  B -->|no| D[Done]\n```")}<p>Mermaid also draws sequence, class, state, Gantt and pie charts. Hand-made SVGs: <code>{{&lt; diagram name="idea" caption="..." &gt;}}</code> draws <code>assets/diagrams/&lt;slug&gt;/idea.svg</code> (add the file to the repo first, or the site won't build).</p>`],
  ["Boxes", example('{{< callout type="note" title="Why this works" >}}\nText. Types: note, tip, important, warning, caution.\n{{< /callout >}}\n\n{{< collapse summary=`Test cases` >}}\nHidden until opened.\n{{< /collapse >}}\n\n{{< details summary="Hugo\'s version" open=true >}}\nOpen by default.\n{{< /details >}}')],
  ["Competitive programming", example('{{< problem title=`E. Two Arrays` source=`Codeforces Round 1102` rating=`2100` limits=`2 s · 256 MB` tags=`dp, math` >}}\n{{< binviz algorithm=`first-fit` capacity=`10` items=`4,8,1,4` caption=`...` >}}')],
  ["GitHub and social", example('{{< repo-card repo="owner/name" title="Title" desc="One line" >}}\n{{< repo-code repo="owner/name" path="src/main.cpp" lines="10-30" hl="3" >}}\n{{< gist user 0123456789abcdef >}}\n{{< x user="username" id="1453110110599868418" >}}\n{{< instagram POST_ID >}}')],
  ["Other", `<p><code>{{&lt; qr text="https://priyanshudebnath.me" /&gt;}}</code> QR code · <code>{{&lt; ref "posts/other-post" &gt;}}</code> link to another post (the build checks it exists) · <code>{{&lt; param title &gt;}}</code> a front matter value · <code>{{&lt; rtl &gt;}}...{{&lt; /rtl &gt;}}</code> right-to-left text · <code>{{&lt; rawhtml &gt;}}...{{&lt; /rawhtml &gt;}}</code>. X and Instagram posts are fetched while the site builds; one that can't be fetched is left out.</p>`],
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
