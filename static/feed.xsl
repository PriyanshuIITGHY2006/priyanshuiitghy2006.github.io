<?xml version="1.0" encoding="utf-8"?>
<!-- Styles /feed.xml when opened in a browser. Feed readers ignore this. -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:atom="http://www.w3.org/2005/Atom">
<xsl:output method="html" encoding="utf-8" indent="yes"
  doctype-system="about:legacy-compat"/>

<xsl:template match="/rss/channel">
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>RSS feed · <xsl:value-of select="title"/></title>
  <style>
    :root {
      --bg: #f6f3ec; --fg: #25221e; --muted: #6e685e; --line: #e3ddd0;
      --code: #ece7dc; --accent: #9a3412;
      color-scheme: light dark;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #1b1816; --fg: #ece6df; --muted: #a39a90; --line: #2e2925;
              --code: #2a2522; --accent: #e0a458; }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--fg);
      font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    main { max-width: 720px; margin: 0 auto; padding: 56px 16px 80px; }
    a { color: inherit; }
    .badge {
      display: inline-block; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
      color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 1px 8px;
    }
    h1 { font-size: 32px; line-height: 1.2; margin: 14px 0 8px; }
    .lede { color: var(--muted); margin: 0 0 18px; }
    .copy {
      display: flex; gap: 8px; align-items: center; margin-bottom: 40px;
      background: var(--code); border-radius: 6px; padding: 8px 8px 8px 12px;
    }
    .copy code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 14px; }
    .copy button {
      font: inherit; font-size: 13px; cursor: pointer; border: 0; border-radius: 4px;
      padding: 4px 12px; background: var(--fg); color: var(--bg);
    }
    ol { list-style: none; padding: 0; margin: 0; }
    li { padding: 22px 0; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    li h2 { font-size: 22px; line-height: 1.3; margin: 0 0 6px; }
    li h2 a { text-decoration: none; }
    li h2 a:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; }
    li p { margin: 0 0 8px; color: var(--muted); font-size: 15px; }
    time { font-size: 13px; color: var(--muted); }
    .back { display: inline-block; margin-top: 32px; font-size: 14px; color: var(--muted); }
  </style>
</head>
<body>
<main>
  <span class="badge">RSS feed</span>
  <h1><xsl:value-of select="title"/></h1>
  <p class="lede">This page is a feed. Paste the address below into a feed reader to get new posts as they come out.</p>
  <div class="copy">
    <code id="feed-url"><xsl:value-of select="atom:link[@rel='self']/@href"/></code>
    <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('feed-url').textContent.trim()).then(()=>{{this.textContent='Copied'}})">Copy</button>
  </div>
  <ol>
    <xsl:for-each select="item">
      <li>
        <h2><a href="{link}"><xsl:value-of select="title"/></a></h2>
        <p><xsl:value-of select="description"/></p>
        <time><xsl:value-of select="substring(pubDate, 6, 11)"/></time>
      </li>
    </xsl:for-each>
  </ol>
  <a class="back" href="{link}">← Back to the site</a>
</main>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
