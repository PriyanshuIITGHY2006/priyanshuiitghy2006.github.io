// Own copy of the site's minimal, table-based HTML email layout — matches
// notify-new-post/_shared/email-layout.ts by convention (Deno edge functions
// each get their own copy rather than sharing a module across functions).
//
// This one is used for BOTH mailing-list campaigns (blog subscribers, with a
// "— Blog" masthead and a subscribe/unsubscribe footer) and one-off mail to
// people who never subscribed to anything (recruiters, contacts — sent via
// "custom recipients" mode). Nothing subscriber-flavored is hardcoded: the
// masthead subtitle and the unsubscribe footer are both opt-in per call, so
// a custom-recipient send renders as a plain, professional email with no
// mention of subscribing at all.

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

export function renderEmailLayout(opts: {
  title: string;
  preheader?: string;
  bodyHtml: string;
  signatureHtml?: string;
  brandHref?: string;
  brandSubtitle?: string;
  unsubscribeUrl?: string;
}): string {
  const {
    title,
    preheader = "",
    bodyHtml,
    signatureHtml,
    brandHref = "https://priyanshudebnath.me",
    brandSubtitle = "",
    unsubscribeUrl,
  } = opts;
  const footerRow = unsubscribeUrl
    ? `<tr>
        <td style="padding: 16px 32px; background:#fafafa; border-top: 1px solid #e4e4e7; font-size: 11px; color:#71717a; line-height:1.7; font-family:${MONO};">
          You're receiving this because you subscribed at priyanshudebnath.me.<br>
          <a href="${unsubscribeUrl}" style="color:#71717a;">unsubscribe</a>
        </td>
      </tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  .body a { color:#0b57d0; text-decoration:none; border-bottom:1px solid #c6d6f5; }
  .body h1, .body h2, .body h3 { font-family:${MONO}; font-weight:600; letter-spacing:-0.2px; margin:24px 0 8px; }
  .body code { font-family:${MONO}; font-size:13px; background:#f4f4f5; padding:1px 5px; border-radius:3px; }
  .body pre { font-family:${MONO}; font-size:13px; background:#f7f7f8; border:1px solid #e6e6e8; padding:14px; overflow-x:auto; }
  .body pre code { background:none; padding:0; }
  .body > :first-child { margin-top:0; }
  .body blockquote { margin:18px 0; padding-left:14px; border-left:2px solid #111111; color:#444444; }
</style>
</head>
<body style="margin:0; padding:0; background:#f6f6f7;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border:1px solid #e4e4e7; font-family:${SANS}; color:#18181b;">
          <tr>
            <td style="padding: 18px 32px; border-bottom: 1px solid #e4e4e7; font-family:${MONO}; font-size:13px;">
              <a href="${brandHref}" style="text-decoration:none; color:#18181b;">
                <span style="font-weight:600;">Priyanshu Debnath</span>
                ${brandSubtitle ? `<span style="color:#a1a1aa; margin-left: 6px;">${escapeHtml(brandSubtitle)}</span>` : ""}
              </a>
            </td>
          </tr>
          <tr>
            <td class="body" style="padding: 28px 32px; font-size: 15px; line-height: 1.65;">
              ${bodyHtml}
              ${signatureHtml ? `<div style="margin-top: 26px; padding-top: 18px; border-top: 1px dashed #d4d4d8; font-size: 14px; color:#52525b;">${signatureHtml}</div>` : ""}
            </td>
          </tr>
          ${footerRow}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
