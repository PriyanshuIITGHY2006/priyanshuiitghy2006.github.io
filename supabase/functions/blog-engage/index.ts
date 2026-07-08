import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Gate for the two anon-writable actions on the blog (subscribe, comment).
// Both used to be direct SECURITY DEFINER RPC calls the client could reach
// with the public anon key, with nothing stopping a script from calling them
// thousands of times (e.g. mass-subscribing arbitrary third-party emails,
// each one triggering an automatic welcome email sent from this site's
// identity). The RPCs are no longer granted to anon; this function verifies
// a Turnstile token server-side first, then calls them with the service role.
Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://priyanshuiitghy2006.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";

    if (!turnstileToken) {
      return json({ error: "Anti-bot verification required.", code: "VERIFICATION_REQUIRED" }, 401);
    }

    const formData = new FormData();
    formData.append("secret", Deno.env.get("TURNSTILE_SECRET_KEY")!);
    formData.append("response", turnstileToken);
    const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const cfResult = await cfRes.json();
    if (!cfResult.success) {
      return json({ error: "Bot verification failed.", code: "VERIFICATION_REQUIRED" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (body.action === "subscribe") {
      const name = String(body.name ?? "").trim().slice(0, 200);
      const email = String(body.email ?? "").trim().slice(0, 320);
      if (!name || !email) return json({ error: "name and email required" }, 400);

      const { data, error } = await supabase
        .rpc("subscribe_to_blog", { p_name: name, p_email: email })
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ alreadySubscribed: (data as { already_subscribed: boolean } | null)?.already_subscribed ?? false });
    }

    if (body.action === "comment") {
      const slug = String(body.slug ?? "").trim().slice(0, 200);
      const name = String(body.name ?? "").trim().slice(0, 200);
      const message = String(body.message ?? "").trim().slice(0, 4000);
      if (!slug || !name || !message) return json({ error: "slug, name and message required" }, 400);

      const { error } = await supabase.rpc("submit_blog_comment", { p_slug: slug, p_name: name, p_message: message });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
});
