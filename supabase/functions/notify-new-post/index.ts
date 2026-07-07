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

    const postUrl = `https://priyanshuiitghy2006.github.io/#/blog?slug=${encodeURIComponent(slug)}`;

    const bodyHtml = `
      <p style="margin:0 0 4px; font-size:12px; letter-spacing:0.5px; color:#666666; text-transform:uppercase;">New post</p>
      <h2 style="font-size:20px; margin: 0 0 8px; line-height:1.3;">${escapeHtml(title)}</h2>
      ${date ? `<p style="color:#888888; font-size:13px; margin: 0 0 14px;">${escapeHtml(date)}</p>` : ""}
      ${excerpt ? `<p style="margin: 0 0 18px;">${escapeHtml(excerpt)}</p>` : ""}
      <p><a href="${postUrl}" style="color:#000000; border-bottom:1px solid #000000; text-decoration:none;">Read it &rarr;</a></p>
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
          sender: { name: "Priyanshu Debnath", email: "priyanshuib01@gmail.com" },
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
