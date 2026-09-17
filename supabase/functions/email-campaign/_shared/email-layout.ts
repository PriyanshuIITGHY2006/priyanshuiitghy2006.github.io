// Own copy of the site's minimal, table-based HTML email layout — matches
// notify-new-post/_shared/email-layout.ts by convention (Deno edge functions
// each get their own copy rather than sharing a module across functions).
// Extended here with an optional signature block and per-recipient
// unsubscribe link, since campaign emails need both and the blog-notify
// template doesn't.

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

export function renderEmailLayout(opts: {
  title: string;
  preheader?: string;
  bodyHtml: string;
  signatureHtml?: string;
  unsubscribeUrl?: string;
}): string {
  const { title, preheader = "", bodyHtml, signatureHtml, unsubscribeUrl } = opts;
  const footerLines = unsubscribeUrl
    ? `You're receiving this because you subscribed at priyanshudebnath.me.<br>
       <a href="${unsubscribeUrl}" style="color:#888888;">Unsubscribe</a>`
    : `You're receiving this because you subscribed at priyanshudebnath.me.<br>
       Didn't sign up for this? Just ignore or delete this email.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background:#ffffff;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; font-family: Georgia, 'Times New Roman', Cambria, serif; color:#000000;">
          <tr>
            <td style="padding-bottom: 14px; border-bottom: 1px solid #000000;">
              <a href="https://priyanshudebnath.me/blogs" style="text-decoration:none; color:#000000;">
                <span style="font-size: 19px; font-weight: bold; letter-spacing: 0.3px;">Priyanshu Debnath</span>
                <span style="font-size: 12px; color:#666666; margin-left: 8px;">&mdash; Blog</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 0; font-size: 15px; line-height: 1.65;">
              ${bodyHtml}
              ${signatureHtml ? `<div style="margin-top: 26px; padding-top: 18px; border-top: 1px solid #eeeeee;">${signatureHtml}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding-top: 18px; border-top: 1px solid #dddddd; font-size: 12px; color:#888888; line-height:1.6; font-family: Georgia, 'Times New Roman', Cambria, serif;">
              ${footerLines}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
