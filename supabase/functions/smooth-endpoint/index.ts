import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// A verified visitor gets a signed session good for this long / this many runs,
// so they solve the Turnstile challenge once instead of on every execution.
const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_RUNS_PER_SESSION = 40

interface SessionPayload {
  iat: number
  exp: number
  count: number
}

function b64urlEncode(bytes: Uint8Array): string {
  let str = ""
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=")
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// Derive a dedicated signing key from the Turnstile secret rather than reusing
// it directly, so this token purpose is cryptographically separate.
async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")!
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`run-session-v1:${secret}`))
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
}

async function createSessionToken(payload: SessionPayload): Promise<string> {
  const key = await getSigningKey()
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${b64urlEncode(new Uint8Array(sig))}`
}

async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts

  try {
    const key = await getSigningKey()
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64),
      new TextEncoder().encode(payloadB64),
    )
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as SessionPayload
    if (typeof payload.exp !== "number" || typeof payload.count !== "number") return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function verificationRequired(message: string, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: message, code: "VERIFICATION_REQUIRED" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 401,
  })
}

serve(async (req) => {
  // Lock down CORS to your domain for production security
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://priyanshuiitghy2006.github.io", // Change to '*' temporarily if testing locally
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-turnstile-token, x-run-session",
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 1. Reuse an existing verified session if the client has one, otherwise
    //    fall back to requiring a fresh Turnstile solve.
    const runSessionHeader = req.headers.get("x-run-session")
    let session = runSessionHeader ? await verifySessionToken(runSessionHeader) : null

    if (session && session.count >= MAX_RUNS_PER_SESSION) {
      session = null
    }

    if (!session) {
      const turnstileToken = req.headers.get("x-turnstile-token")
      if (!turnstileToken) {
        return verificationRequired("Anti-bot verification required.", corsHeaders)
      }

      const formData = new FormData()
      formData.append("secret", Deno.env.get("TURNSTILE_SECRET_KEY")!)
      formData.append("response", turnstileToken)

      const cfResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData,
      })
      const cfResult = await cfResponse.json()

      if (!cfResult.success) {
        return verificationRequired("Bot verification failed.", corsHeaders)
      }

      const now = Date.now()
      session = { iat: now, exp: now + SESSION_TTL_MS, count: 0 }
    }

    // 2. Proceed to compiler.io
    const { compiler, code, input } = await req.json()

    const compilerResponse = await fetch("https://api.onlinecompiler.io/api/run-code-sync/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": Deno.env.get("COMPILER_API_KEY")!,
      },
      body: JSON.stringify({ compiler, code, input }),
    })

    const data = await compilerResponse.json()

    // 3. Ratchet the session forward (same expiry, incremented run count) so
    //    the next request can keep reusing it without re-verifying.
    session.count += 1
    const nextToken = await createSessionToken(session)

    return new Response(
      JSON.stringify({
        ...data,
        session: nextToken,
        sessionExpiresAt: session.exp,
        runsRemaining: MAX_RUNS_PER_SESSION - session.count,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})
