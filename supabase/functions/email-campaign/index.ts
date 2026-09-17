import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { marked } from "npm:marked@12";
import { renderEmailLayout } from "./_shared/email-layout.ts";

// Admin-only mass-mail sender for blog_subscribers. Mirrors github-publish's
// gating (is_admin() run under the caller's own JWT) since this also needs
// server-held secrets (BREVO_API_KEY, and storage reads for attachments)
// that the admin panel can't hold client-side. Draft CRUD for
// email_campaigns happens directly via supabase-js from the admin panel —
// RLS already gates that on is_admin() — so this function only ever needs
// to actually send mail.
const DEFAULT_SENDER_DOMAIN = "priyanshudebnath.me";
const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024; // Brevo's practical email-size ceiling is ~10MB; leave headroom for the HTML body

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://priyanshudebnath.me",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function isCallerAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("is_admin check failed", error);
    return false;
  }
  return data === true;
}

interface EmailSettingsRow {
  signature_markdown: string | null;
  reply_to_email: string | null;
  sender_name: string;
  sender_email: string;
}

interface AttachmentRef {
  name: string;
  bucket: string;
  path: string;
}

interface BrevoAttachment {
  name: string;
  content: string;
}

function isAttachmentRef(v: unknown): v is AttachmentRef {
  return !!v && typeof v === "object"
    && typeof (v as AttachmentRef).name === "string"
    && typeof (v as AttachmentRef).bucket === "string"
    && typeof (v as AttachmentRef).path === "string";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// deno-lint-ignore no-explicit-any
async function resolveAttachments(admin: any, refs: unknown): Promise<BrevoAttachment[]> {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  let totalBytes = 0;
  const out: BrevoAttachment[] = [];
  for (const ref of refs) {
    if (!isAttachmentRef(ref)) continue;
    const { data: blob, error } = await admin.storage.from(ref.bucket).download(ref.path);
    if (error || !blob) throw new Error(`Couldn't load attachment "${ref.name}": ${error?.message ?? "not found"}`);
    totalBytes += blob.size;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error(`Attachments are too large — keep the combined total under ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)}MB.`);
    }
    out.push({ name: ref.name, content: await blobToBase64(blob) });
  }
  return out;
}

async function sendBrevoEmail(opts: {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string | null;
  attachments?: BrevoAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": Deno.env.get("BREVO_API_KEY")!,
    },
    body: JSON.stringify({
      sender: { name: opts.senderName, email: opts.senderEmail },
      to: [{ email: opts.to, name: opts.toName || undefined }],
      subject: opts.subject,
      htmlContent: opts.html,
      ...(opts.replyTo ? { replyTo: { email: opts.replyTo } } : {}),
      ...(opts.attachments?.length ? { attachment: opts.attachments } : {}),
    }),
  });
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  console.error("Brevo error for", opts.to, text);
  return { ok: false, error: text.slice(0, 300) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!(await isCallerAdmin(req))) {
    return json({ error: "Forbidden" }, 403);
  }

  // Service role for reading subscribers/settings/attachments and updating
  // campaign status/counts — anon/authenticated intentionally can't see
  // subscriber emails, and the admin's own RLS-gated session already got us
  // past isCallerAdmin above.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();

    const { data: settingsRow } = await admin
      .from("email_settings")
      .select("signature_markdown, reply_to_email, sender_name, sender_email")
      .eq("id", 1)
      .maybeSingle<EmailSettingsRow>();
    const signatureHtml = settingsRow?.signature_markdown
      ? (marked.parse(settingsRow.signature_markdown) as string)
      : "";
    const replyTo = settingsRow?.reply_to_email || null;
    const defaultSenderName = settingsRow?.sender_name || "Priyanshu Debnath";
    const defaultSenderEmail = settingsRow?.sender_email || `noreply@${DEFAULT_SENDER_DOMAIN}`;

    // Brevo only accepts senders on domains it's verified for this account
    // (DKIM/SPF set up for priyanshudebnath.me) — reject anything else here
    // with a clear message instead of a confusing Brevo 400.
    function resolveSender(name: unknown, email: unknown): { senderName: string; senderEmail: string } {
      const senderEmail = typeof email === "string" && email.trim() ? email.trim() : defaultSenderEmail;
      if (!senderEmail.toLowerCase().endsWith(`@${DEFAULT_SENDER_DOMAIN}`)) {
        throw new Error(`Sender address must be on ${DEFAULT_SENDER_DOMAIN} (the only domain verified for sending).`);
      }
      const senderName = typeof name === "string" && name.trim() ? name.trim() : defaultSenderName;
      return { senderName, senderEmail };
    }

    if (body.action === "send_test") {
      const subject: unknown = body.subject;
      const bodyMarkdown: unknown = body.bodyMarkdown;
      const preheader: unknown = body.preheader;
      const testEmail: unknown = body.testEmail;
      if (typeof subject !== "string" || !subject || typeof bodyMarkdown !== "string" || !bodyMarkdown || typeof testEmail !== "string" || !testEmail) {
        return json({ error: "subject, bodyMarkdown, and testEmail are required" }, 400);
      }
      const { senderName, senderEmail } = resolveSender(body.senderName, body.senderEmail);
      const attachments = await resolveAttachments(admin, body.attachments);
      const bodyHtml = marked.parse(bodyMarkdown) as string;
      const html = renderEmailLayout({
        title: subject,
        preheader: typeof preheader === "string" ? preheader : subject,
        bodyHtml,
        signatureHtml,
      });
      const result = await sendBrevoEmail({
        to: testEmail,
        subject: `[TEST] ${subject}`,
        html,
        senderName,
        senderEmail,
        replyTo,
        attachments,
      });
      if (!result.ok) return json({ error: `Brevo send failed: ${result.error}` }, 502);
      return json({ ok: true });
    }

    if (body.action === "send_campaign") {
      const campaignId: unknown = body.campaignId;
      if (typeof campaignId !== "string" || !campaignId) {
        return json({ error: "campaignId is required" }, 400);
      }

      const { data: campaign, error: campaignError } = await admin
        .from("email_campaigns")
        .select("id, subject, preheader, body_markdown, status, sender_name, sender_email, attachments")
        .eq("id", campaignId)
        .maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      if (campaign.status === "sending") {
        return json({ error: "Campaign is already sending" }, 409);
      }

      const { senderName, senderEmail } = resolveSender(campaign.sender_name, campaign.sender_email);
      const attachments = await resolveAttachments(admin, campaign.attachments);

      await admin.from("email_campaigns").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", campaignId);

      const { data: subscribers, error: subscribersError } = await admin
        .from("blog_subscribers")
        .select("email, name, unsubscribe_token");
      if (subscribersError) throw subscribersError;

      const bodyHtml = marked.parse(campaign.body_markdown) as string;

      let sent = 0;
      let failed = 0;
      for (const sub of subscribers ?? []) {
        const unsubscribeUrl = `https://priyanshudebnath.me/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;
        const html = renderEmailLayout({
          title: campaign.subject,
          preheader: campaign.preheader || campaign.subject,
          bodyHtml,
          signatureHtml,
          unsubscribeUrl,
        });
        const result = await sendBrevoEmail({
          to: sub.email,
          toName: sub.name,
          subject: campaign.subject,
          html,
          senderName,
          senderEmail,
          replyTo,
          attachments,
        });
        if (result.ok) sent++;
        else failed++;
      }

      const total = subscribers?.length ?? 0;
      const finalStatus = sent > 0 ? "sent" : "failed";
      await admin
        .from("email_campaigns")
        .update({
          status: finalStatus,
          recipient_count: total,
          sent_count: sent,
          failed_count: failed,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);

      return json({ ok: true, sent, failed, total });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("email-campaign error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
