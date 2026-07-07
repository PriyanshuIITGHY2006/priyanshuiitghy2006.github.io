import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { renderEmailLayout, escapeHtml } from "./_shared/email-layout.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Called from a Postgres trigger (pg_net), not a browser — auth is a
  // shared secret rather than a Supabase user JWT.
  if (req.headers.get("x-internal-secret") !== Deno.env.get("INTERNAL_WEBHOOK_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { name, email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email required" }), { status: 400 });
    }

    const bodyHtml = `
      <p>Hi ${escapeHtml(name) || "there"},</p>
      <p>You're subscribed — you'll get a short note here whenever a new post goes up.</p>
      <blockquote style="margin: 22px 0; padding: 2px 0 2px 16px; border-left: 2px solid #000000; font-style: italic; color:#333333;">
        &ldquo;Premature optimization is the root of all evil.&rdquo;
        <div style="margin-top: 6px; font-style: normal; font-size: 13px; color:#666666;">&mdash; Donald Knuth</div>
      </blockquote>
      <p>Read the latest posts any time at <a href="https://priyanshuiitghy2006.github.io/#/blogs" style="color:#000000;">the blog</a>.</p>
      <p>&mdash; Priyanshu</p>
    `;

    const html = renderEmailLayout({
      title: "You're subscribed",
      preheader: "You're subscribed to new posts.",
      bodyHtml,
    });

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": Deno.env.get("BREVO_API_KEY")!,
      },
      body: JSON.stringify({
        sender: { name: "Priyanshu Debnath", email: "priyanshuib01@gmail.com" },
        to: [{ email, name: name || undefined }],
        subject: "You're subscribed",
        htmlContent: html,
      }),
    });

    if (!brevoRes.ok) {
      console.error("Brevo error:", await brevoRes.text());
      return new Response(JSON.stringify({ error: "email send failed" }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
});
