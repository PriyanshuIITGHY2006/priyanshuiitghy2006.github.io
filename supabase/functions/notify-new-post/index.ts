import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderEmailLayout, escapeHtml } from "./_shared/email-layout.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Called from the GitHub Actions deploy workflow, not a browser — auth is
  // a shared secret rather than a Supabase user JWT.
  if (req.headers.get("x-internal-secret") !== Deno.env.get("INTERNAL_WEBHOOK_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { title, slug, excerpt, date } = await req.json();
    if (!title || !slug) {
      return new Response(JSON.stringify({ error: "title and slug required" }), { status: 400 });
    }

    // Service role bypasses RLS so this can read every subscriber's email,
    // which anon intentionally cannot. Auto-injected into every edge function.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subscribers, error } = await supabase
      .from("blog_subscribers")
      .select("name, email");
    if (error) throw error;

    const postUrl = `https://priyanshudebnath.me/blog?slug=${encodeURIComponent(slug)}`;

    const mono = "font-family:'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;";
    const bodyHtml = `
      <p style="margin:0 0 10px; ${mono} font-size:12px; color:#71717a;">New post${date ? ` &middot; ${escapeHtml(date)}` : ""}</p>
      <h2 style="font-size:22px; margin:0 0 12px; line-height:1.3; letter-spacing:-0.3px;">${escapeHtml(title)}</h2>
      ${excerpt ? `<p style="margin:0 0 24px; color:#3f3f46;">${escapeHtml(excerpt)}</p>` : ""}
      <a href="${postUrl}" style="display:inline-block; padding:10px 18px; background:#18181b; color:#ffffff; text-decoration:none; border-bottom:none; ${mono} font-size:13px;">Read the post &rarr;</a>
    `;

    const html = renderEmailLayout({
      title,
      preheader: excerpt || title,
      bodyHtml,
    });

    let sent = 0;
    let failed = 0;
    for (const sub of subscribers ?? []) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": Deno.env.get("BREVO_API_KEY")!,
        },
        body: JSON.stringify({
          sender: { name: "Priyanshu Debnath", email: "noreply@priyanshudebnath.me" },
          to: [{ email: sub.email, name: sub.name || undefined }],
          subject: `New post: ${title}`,
          htmlContent: html,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failed++;
        console.error("Brevo error for", sub.email, await res.text());
      }
    }

    return new Response(JSON.stringify({ sent, failed, total: subscribers?.length ?? 0 }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
});
