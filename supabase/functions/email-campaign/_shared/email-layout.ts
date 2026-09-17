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
        <td style="padding-top: 18px; border-top: 1px solid #dddddd; font-size: 12px; color:#888888; line-height:1.6; font-family: Georgia, 'Times New Roman', Cambria, serif;">
          You're receiving this because you subscribed at priyanshudebnath.me.<br>
          <a href="${unsubscribeUrl}" style="color:#888888;">Unsubscribe</a>
        </td>
      </tr>`
    : "";
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
              <a href="${brandHref}" style="text-decoration:none; color:#000000;">
                <span style="font-size: 19px; font-weight: bold; letter-spacing: 0.3px;">Priyanshu Debnath</span>
                ${brandSubtitle ? `<span style="font-size: 12px; color:#666666; margin-left: 8px;">${escapeHtml(brandSubtitle)}</span>` : ""}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 0; font-size: 15px; line-height: 1.65;">
              ${bodyHtml}
              ${signatureHtml ? `<div style="margin-top: 26px; padding-top: 18px; border-top: 1px solid #eeeeee;">${signatureHtml}</div>` : ""}
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
