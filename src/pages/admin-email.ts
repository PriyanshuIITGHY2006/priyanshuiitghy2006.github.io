// Email tab: mailing-list settings (sender identity, reply-to, signature),
// a list of past/draft campaigns, and a composer (subject/preheader/
// markdown body + attachments) that can save a draft, send a one-off test,
// or fire the campaign to every blog_subscriber.
//
// Draft CRUD goes straight through supabase-js (RLS already gates writes on
// is_admin()). Only the actual Brevo send needs the email-campaign edge
// function, since that alone needs the BREVO_API_KEY secret held
// server-side. Attachments upload straight to the private email-attachments
// bucket and are referenced by {bucket, path} — the send function pulls
// them server-side and base64-embeds them into the outgoing mail.

import { supabase, RESUME_PDF_BUCKET, RESUME_PDF_FILE, EMAIL_ATTACHMENTS_BUCKET, resumePdfExists } from "../lib/supabase";
import { sendTestCampaignEmail, sendCampaignToAllSubscribers, type CampaignAttachment } from "../lib/admin-publish";
import { confirmDialog } from "../lib/confirm-dialog";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // matches the edge function's combined-total cap

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function setStatus(target: HTMLElement, msg: string, ok: boolean): void {
  target.textContent = msg;
  target.className = `admin-status ${ok ? "admin-status-ok" : "admin-status-err"}`;
  target.style.display = "block";
  if (ok) setTimeout(() => { target.style.display = "none"; }, 4000);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface EmailSettings {
  signature_markdown: string | null;
  reply_to_email: string | null;
  sender_name: string;
  sender_email: string;
}

interface EmailCampaign {
  id: string;
  subject: string;
  preheader: string | null;
  body_markdown: string;
  status: "draft" | "sending" | "sent" | "failed";
  recipient_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  sender_name: string | null;
  sender_email: string | null;
  attachments: CampaignAttachment[];
}

let cachedSettings: EmailSettings | null = null;

async function loadSettings(): Promise<EmailSettings> {
  const { data } = await supabase
    .from("email_settings")
    .select("signature_markdown, reply_to_email, sender_name, sender_email")
    .eq("id", 1)
    .maybeSingle<EmailSettings>();
  cachedSettings = data ?? {
    signature_markdown: null,
    reply_to_email: null,
    sender_name: "Priyanshu Debnath",
    sender_email: "noreply@priyanshudebnath.me",
  };
  return cachedSettings;
}

export async function renderEmailTab(el: HTMLElement): Promise<void> {
  const [settings, { data: campaignRows }] = await Promise.all([
    loadSettings(),
    supabase.from("email_campaigns").select("*").order("updated_at", { ascending: false }),
  ]);
  const campaigns = (campaignRows as EmailCampaign[] | null) ?? [];

  el.innerHTML = `
    <div class="admin-form-section">
      <h3>Sender &amp; signature</h3>
      <p class="edu-note" style="margin-top:0;">
        Default identity for every campaign — Brevo only accepts addresses on the verified <code>priyanshudebnath.me</code> domain, but the local part (before the @) is yours to pick, and each campaign can still override it below.
      </p>
      <div id="es-status" class="admin-status" style="display:none"></div>
      <div class="admin-form">
        <div class="admin-form-row">
          <div><label>Sender name</label><input type="text" id="es-sender-name" value="${esc(settings.sender_name)}" placeholder="Priyanshu Debnath"/></div>
          <div><label>Sender email</label><input type="text" id="es-sender-email" value="${esc(settings.sender_email)}" placeholder="hello@priyanshudebnath.me"/></div>
        </div>
        <div><label>Reply-To (optional)</label><input type="text" id="es-reply-to" value="${esc(settings.reply_to_email ?? "")}" placeholder="you@priyanshudebnath.me"/></div>
        <div><label>Signature (Markdown, appended to every email)</label><textarea id="es-signature" style="min-height:90px">${esc(settings.signature_markdown ?? "")}</textarea></div>
        <div class="admin-form-actions">
          <button type="button" class="admin-btn admin-btn-primary" id="es-save">Save settings</button>
        </div>
      </div>
    </div>

    <div class="admin-form-section">
      <h3>Campaigns</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Subject</th><th>Status</th><th>Recipients</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody id="ec-list"></tbody>
        </table>
      </div>
    </div>

    <div class="admin-form-section">
      <h3 id="ec-composer-heading">New campaign</h3>
      <div id="ec-status" class="admin-status" style="display:none"></div>
      <div class="admin-form">
        <div><label>Subject</label><input type="text" id="ec-subject" placeholder="What's new on the site"/></div>
        <div><label>Preheader (preview text in the inbox)</label><input type="text" id="ec-preheader" placeholder="One short line — shows up next to the subject"/></div>
        <div class="admin-form-row">
          <div><label>Sender name override (optional)</label><input type="text" id="ec-sender-name" placeholder="defaults to ${esc(settings.sender_name)}"/></div>
          <div><label>Sender email override (optional)</label><input type="text" id="ec-sender-email" placeholder="defaults to ${esc(settings.sender_email)}"/></div>
        </div>
      </div>
    </div>

    <div class="admin-editor-split">
      <div class="admin-editor-pane">
        <label class="admin-editor-pane-label">Markdown</label>
        <textarea id="ec-body" class="admin-editor-textarea" placeholder="## Hey!&#10;&#10;Write the campaign body here — Markdown, rendered the same as a blog post."></textarea>
      </div>
      <div class="admin-editor-pane">
        <label class="admin-editor-pane-label">Live preview (approximate — real send re-renders server-side)</label>
        <div class="admin-editor-preview">
          <div class="blog-content" id="ec-preview"></div>
        </div>
      </div>
    </div>

    <div class="admin-form-section" style="margin-top:0.8rem;">
      <h3>Attachments</h3>
      <p class="edu-note" style="margin-top:0;">Combined total must stay under ${formatBytes(MAX_ATTACHMENT_BYTES)}.</p>
      <div id="ec-attach-list"></div>
      <div class="admin-form-actions" style="margin-top:0.4rem;">
        <input type="file" id="ec-attach-input" style="display:none" multiple/>
        <button type="button" class="admin-btn" id="ec-attach-btn">+ Attach file…</button>
        <button type="button" class="admin-btn" id="ec-attach-resume-btn">+ Attach current résumé PDF</button>
      </div>
    </div>

    <div class="admin-form-actions" style="margin-top:0.8rem;">
      <span class="edu-note" id="ec-recipient-count" style="margin:0;"></span>
    </div>
    <div class="admin-form-actions">
      <button type="button" class="admin-btn admin-btn-primary" id="ec-save-draft">Save draft</button>
      <div style="display:flex;gap:0.4rem;align-items:center;">
        <input type="email" id="ec-test-email" placeholder="you@example.com" style="width:auto;"/>
        <button type="button" class="admin-btn" id="ec-send-test">Send test</button>
      </div>
      <button type="button" class="admin-btn admin-btn-danger" id="ec-send-all">Send to all subscribers</button>
      <button type="button" class="admin-btn" id="ec-new" style="display:none;">New campaign (cancel edit)</button>
    </div>`;

  wireSettingsForm(el);
  wireComposer(el, campaigns);
  void refreshRecipientCount(el);
}

// ── Settings form ────────────────────────────────────────────────────────
function wireSettingsForm(el: HTMLElement): void {
  const statusEl = el.querySelector<HTMLElement>("#es-status")!;
  const saveBtn = el.querySelector<HTMLButtonElement>("#es-save")!;
  saveBtn.addEventListener("click", async () => {
    const senderName = el.querySelector<HTMLInputElement>("#es-sender-name")!.value.trim();
    const senderEmail = el.querySelector<HTMLInputElement>("#es-sender-email")!.value.trim();
    const replyTo = el.querySelector<HTMLInputElement>("#es-reply-to")!.value.trim();
    const signature = el.querySelector<HTMLTextAreaElement>("#es-signature")!.value;
    if (!senderName || !senderEmail) {
      setStatus(statusEl, "Sender name and email are required.", false);
      return;
    }
    if (!senderEmail.toLowerCase().endsWith("@priyanshudebnath.me")) {
      setStatus(statusEl, "Sender email must be on priyanshudebnath.me (the only domain verified for sending).", false);
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    const { error } = await supabase.from("email_settings").upsert({
      id: 1,
      sender_name: senderName,
      sender_email: senderEmail,
      reply_to_email: replyTo || null,
      signature_markdown: signature || null,
      updated_at: new Date().toISOString(),
    });
    saveBtn.disabled = false;
    saveBtn.textContent = "Save settings";
    if (error) {
      setStatus(statusEl, "Error: " + error.message, false);
      return;
    }
    cachedSettings = { sender_name: senderName, sender_email: senderEmail, reply_to_email: replyTo || null, signature_markdown: signature || null };
    setStatus(statusEl, "Saved!", true);
  });
}

// ── Campaign list + composer ────────────────────────────────────────────
function wireComposer(el: HTMLElement, campaigns: EmailCampaign[]): void {
  const listEl = el.querySelector<HTMLElement>("#ec-list")!;
  const headingEl = el.querySelector<HTMLElement>("#ec-composer-heading")!;
  const statusEl = el.querySelector<HTMLElement>("#ec-status")!;
  const subjectEl = el.querySelector<HTMLInputElement>("#ec-subject")!;
  const preheaderEl = el.querySelector<HTMLInputElement>("#ec-preheader")!;
  const senderNameEl = el.querySelector<HTMLInputElement>("#ec-sender-name")!;
  const senderEmailEl = el.querySelector<HTMLInputElement>("#ec-sender-email")!;
  const bodyEl = el.querySelector<HTMLTextAreaElement>("#ec-body")!;
  const previewEl = el.querySelector<HTMLElement>("#ec-preview")!;
  const attachListEl = el.querySelector<HTMLElement>("#ec-attach-list")!;
  const attachInput = el.querySelector<HTMLInputElement>("#ec-attach-input")!;
  const attachBtn = el.querySelector<HTMLButtonElement>("#ec-attach-btn")!;
  const attachResumeBtn = el.querySelector<HTMLButtonElement>("#ec-attach-resume-btn")!;
  const saveDraftBtn = el.querySelector<HTMLButtonElement>("#ec-save-draft")!;
  const testEmailEl = el.querySelector<HTMLInputElement>("#ec-test-email")!;
  const sendTestBtn = el.querySelector<HTMLButtonElement>("#ec-send-test")!;
  const sendAllBtn = el.querySelector<HTMLButtonElement>("#ec-send-all")!;
  const newBtn = el.querySelector<HTMLButtonElement>("#ec-new")!;

  let editingId: string | null = null;
  let attachments: CampaignAttachment[] = [];

  function renderAttachList(): void {
    attachListEl.innerHTML = attachments.length
      ? attachments.map((a, i) => `
        <div class="admin-link-row" data-attach-idx="${i}">
          <span class="truncate" style="flex:1;">${esc(a.name)} <span class="edu-note" style="margin:0;">(${formatBytes(a.size)})</span></span>
          <button type="button" class="admin-btn admin-btn-danger admin-rm-attach" data-rm-attach="${i}">✕</button>
        </div>`).join("")
      : `<p class="admin-empty-note">No attachments yet.</p>`;
    attachListEl.querySelectorAll<HTMLButtonElement>("[data-rm-attach]").forEach((btn) => {
      btn.addEventListener("click", () => {
        attachments.splice(Number(btn.dataset.rmAttach), 1);
        renderAttachList();
      });
    });
  }
  renderAttachList();

  function totalAttachmentBytes(): number {
    return attachments.reduce((sum, a) => sum + a.size, 0);
  }

  attachBtn.addEventListener("click", () => attachInput.click());
  attachInput.addEventListener("change", async () => {
    const files = Array.from(attachInput.files ?? []);
    attachInput.value = "";
    for (const file of files) {
      if (totalAttachmentBytes() + file.size > MAX_ATTACHMENT_BYTES) {
        setStatus(statusEl, `"${file.name}" would push attachments over ${formatBytes(MAX_ATTACHMENT_BYTES)} combined — skipped.`, false);
        continue;
      }
      const path = `attachments/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      attachBtn.disabled = true;
      attachBtn.textContent = "Uploading…";
      const { error } = await supabase.storage.from(EMAIL_ATTACHMENTS_BUCKET).upload(path, file);
      attachBtn.disabled = false;
      attachBtn.textContent = "+ Attach file…";
      if (error) {
        setStatus(statusEl, `Upload error for "${file.name}": ` + error.message, false);
        continue;
      }
      attachments.push({ name: file.name, bucket: EMAIL_ATTACHMENTS_BUCKET, path, size: file.size });
    }
    renderAttachList();
  });

  attachResumeBtn.addEventListener("click", async () => {
    attachResumeBtn.disabled = true;
    try {
      const exists = await resumePdfExists();
      if (!exists) {
        setStatus(statusEl, "No résumé PDF uploaded yet — upload one from the Resume tab first.", false);
        return;
      }
      const { data: files } = await supabase.storage.from(RESUME_PDF_BUCKET).list("", { search: RESUME_PDF_FILE });
      const size = files?.find((f) => f.name === RESUME_PDF_FILE)?.metadata?.size ?? 0;
      if (totalAttachmentBytes() + size > MAX_ATTACHMENT_BYTES) {
        setStatus(statusEl, `Résumé would push attachments over ${formatBytes(MAX_ATTACHMENT_BYTES)} combined.`, false);
        return;
      }
      attachments.push({ name: "resume.pdf", bucket: RESUME_PDF_BUCKET, path: RESUME_PDF_FILE, size });
      renderAttachList();
      setStatus(statusEl, "Résumé attached — it's pulled fresh at send time, so it'll reflect whatever's current then.", true);
    } finally {
      attachResumeBtn.disabled = false;
    }
  });

  let debounceId: number | undefined;
  function renderPreview(): void {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => {
      const md = bodyEl.value.trim();
      previewEl.innerHTML = md
        ? renderPreviewMarkdown(md)
        : `<p class="admin-empty-note">Start typing to see a live preview.</p>`;
    }, 150);
  }
  bodyEl.addEventListener("input", renderPreview);
  renderPreview();

  function enterEditMode(c: EmailCampaign): void {
    editingId = c.id;
    subjectEl.value = c.subject;
    preheaderEl.value = c.preheader ?? "";
    senderNameEl.value = c.sender_name ?? "";
    senderEmailEl.value = c.sender_email ?? "";
    bodyEl.value = c.body_markdown;
    attachments = [...(c.attachments ?? [])];
    renderAttachList();
    renderPreview();
    headingEl.textContent = `Editing: ${c.subject}`;
    newBtn.style.display = "";
    void refreshRecipientCount(el);
  }

  function resetComposer(): void {
    editingId = null;
    subjectEl.value = "";
    preheaderEl.value = "";
    senderNameEl.value = "";
    senderEmailEl.value = "";
    bodyEl.value = "";
    attachments = [];
    renderAttachList();
    renderPreview();
    headingEl.textContent = "New campaign";
    newBtn.style.display = "none";
  }

  newBtn.addEventListener("click", resetComposer);

  function currentFields() {
    return {
      subject: subjectEl.value.trim(),
      preheader: preheaderEl.value.trim() || null,
      sender_name: senderNameEl.value.trim() || null,
      sender_email: senderEmailEl.value.trim() || null,
      body_markdown: bodyEl.value,
      attachments,
    };
  }

  async function saveDraft(): Promise<EmailCampaign | null> {
    const fields = currentFields();
    if (!fields.subject || !fields.body_markdown.trim()) {
      setStatus(statusEl, "Subject and body are required.", false);
      return null;
    }
    saveDraftBtn.disabled = true;
    saveDraftBtn.textContent = "Saving…";
    const row = {
      ...(editingId ? { id: editingId } : {}),
      ...fields,
      status: "draft" as const,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("email_campaigns").upsert(row).select().maybeSingle<EmailCampaign>();
    saveDraftBtn.disabled = false;
    saveDraftBtn.textContent = "Save draft";
    if (error) {
      setStatus(statusEl, "Error: " + error.message, false);
      return null;
    }
    if (data) enterEditMode(data);
    setStatus(statusEl, "Draft saved.", true);
    void refreshList();
    return data;
  }

  saveDraftBtn.addEventListener("click", () => void saveDraft());

  sendTestBtn.addEventListener("click", async () => {
    const testEmail = testEmailEl.value.trim();
    if (!testEmail) {
      setStatus(statusEl, "Enter an email address to send the test to.", false);
      return;
    }
    const fields = currentFields();
    if (!fields.subject || !fields.body_markdown.trim()) {
      setStatus(statusEl, "Subject and body are required.", false);
      return;
    }
    sendTestBtn.disabled = true;
    sendTestBtn.textContent = "Sending…";
    try {
      await sendTestCampaignEmail({
        subject: fields.subject,
        preheader: fields.preheader ?? "",
        bodyMarkdown: fields.body_markdown,
        testEmail,
        senderName: fields.sender_name ?? undefined,
        senderEmail: fields.sender_email ?? undefined,
        attachments: fields.attachments,
      });
      setStatus(statusEl, `Test sent to ${testEmail}.`, true);
    } catch (err) {
      setStatus(statusEl, "Send error: " + (err instanceof Error ? err.message : String(err)), false);
    } finally {
      sendTestBtn.disabled = false;
      sendTestBtn.textContent = "Send test";
    }
  });

  sendAllBtn.addEventListener("click", async () => {
    const { count } = await supabase.from("blog_subscribers").select("*", { count: "exact", head: true });
    const n = count ?? 0;
    if (n === 0) {
      setStatus(statusEl, "There are no subscribers to send to yet.", false);
      return;
    }
    if (!(await confirmDialog(`Send this campaign to all ${n} subscriber${n === 1 ? "" : "s"}? This can't be undone.`, `Send to ${n}`))) return;

    const saved = await saveDraft();
    if (!saved) return;

    sendAllBtn.disabled = true;
    sendAllBtn.textContent = "Sending…";
    try {
      const result = await sendCampaignToAllSubscribers(saved.id);
      setStatus(statusEl, `Sent to ${result.sent}/${result.total} subscribers${result.failed ? ` (${result.failed} failed)` : ""}.`, true);
      void refreshList();
    } catch (err) {
      setStatus(statusEl, "Send error: " + (err instanceof Error ? err.message : String(err)), false);
    } finally {
      sendAllBtn.disabled = false;
      sendAllBtn.textContent = "Send to all subscribers";
    }
  });

  async function deleteCampaign(id: string, btn: HTMLButtonElement): Promise<void> {
    if (!(await confirmDialog("Delete this campaign? This can't be undone."))) return;
    btn.disabled = true;
    const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
    if (error) {
      alert("Error: " + error.message);
      btn.disabled = false;
      return;
    }
    if (editingId === id) resetComposer();
    void refreshList();
  }

  function duplicateCampaign(c: EmailCampaign): void {
    editingId = null;
    subjectEl.value = `${c.subject} (copy)`;
    preheaderEl.value = c.preheader ?? "";
    senderNameEl.value = c.sender_name ?? "";
    senderEmailEl.value = c.sender_email ?? "";
    bodyEl.value = c.body_markdown;
    attachments = [...(c.attachments ?? [])];
    renderAttachList();
    renderPreview();
    headingEl.textContent = "New campaign";
    newBtn.style.display = "";
    setStatus(statusEl, "Duplicated into the composer below — save as a new draft.", true);
    headingEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function statusBadge(status: EmailCampaign["status"]): string {
    return status;
  }

  function renderList(rows: EmailCampaign[]): void {
    listEl.innerHTML = rows.length
      ? rows.map((c) => `
        <tr>
          <td class="truncate">${esc(c.subject)}</td>
          <td>${esc(statusBadge(c.status))}</td>
          <td>${c.status === "draft" ? "—" : `${c.sent_count ?? 0}/${c.recipient_count ?? 0}`}</td>
          <td style="white-space:nowrap">${esc(new Date(c.updated_at).toLocaleDateString())}</td>
          <td style="white-space:nowrap">
            <button class="admin-btn" data-ec-edit="${esc(c.id)}">Edit</button>
            <button class="admin-btn" data-ec-dup="${esc(c.id)}">Duplicate</button>
            <button class="admin-btn admin-btn-danger" data-ec-del="${esc(c.id)}">Delete</button>
          </td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="admin-table-empty">No campaigns yet.</td></tr>`;

    listEl.querySelectorAll<HTMLButtonElement>("[data-ec-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = rows.find((r) => r.id === btn.dataset.ecEdit);
        if (c) {
          enterEditMode(c);
          headingEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-ec-dup]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = rows.find((r) => r.id === btn.dataset.ecDup);
        if (c) duplicateCampaign(c);
      });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-ec-del]").forEach((btn) => {
      btn.addEventListener("click", () => void deleteCampaign(btn.dataset.ecDel!, btn));
    });
  }

  async function refreshList(): Promise<void> {
    const { data } = await supabase.from("email_campaigns").select("*").order("updated_at", { ascending: false });
    renderList((data as EmailCampaign[] | null) ?? []);
  }

  renderList(campaigns);
}

async function refreshRecipientCount(el: HTMLElement): Promise<void> {
  const target = el.querySelector<HTMLElement>("#ec-recipient-count");
  if (!target) return;
  const { count } = await supabase.from("blog_subscribers").select("*", { count: "exact", head: true });
  target.textContent = `${count ?? 0} subscriber${count === 1 ? "" : "s"} will receive this campaign.`;
}

// Minimal client-side Markdown→HTML for the composer's live preview only —
// deliberately not the full blog.ts pipeline (that has Monaco/testcases/
// binviz extensions that can't render inside an actual email client). The
// real sent HTML is rendered independently, server-side, in the edge
// function via npm:marked.
function renderPreviewMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withInline = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  const lines = withInline.split("\n");
  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (inList) { html.push("</ul>"); inList = false; }
      const level = heading[1].length;
      html.push(`<h${level}>${heading[2]}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${line.replace(/^[-*]\s+/, "")}</li>`);
      continue;
    }
    if (inList) { html.push("</ul>"); inList = false; }
    if (line.trim()) html.push(`<p>${line}</p>`);
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}
