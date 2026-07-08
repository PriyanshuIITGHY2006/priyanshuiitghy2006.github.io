// Site-wide "ask me anything about Priyanshu" chat assistant. Gated by the
// same Turnstile + signed-session pattern as smooth-endpoint.ts (solve once,
// reuse the session for a bounded number of turns / time window) so this
// doesn't become a free, unmetered proxy to the model behind it.
//
// The model is served by GitHub Models (models.github.ai) rather than Azure
// OpenAI — Azure OpenAI itself is blocked on Azure for Students subscriptions
// regardless of region, so this uses GitHub's free inference API instead,
// which speaks the same OpenAI-style chat-completions shape.
//
// Site knowledge is a hand-maintained snapshot below, not a live fetch —
// keep it in sync with src/data/resume.ts, src/data/projects.ts, and
// src/data/blogs/*.md when those change.

const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_TURNS_PER_SESSION = 30
const MAX_MESSAGE_LENGTH = 500
const MAX_HISTORY_TURNS = 6

const MODEL = "openai/gpt-4o-mini"
const GITHUB_MODELS_URL = "https://models.github.ai/inference/chat/completions"

const SITE_KNOWLEDGE = `
Priyanshu Debnath — B.Tech in Electronics and Electrical Engineering, minor in
Mathematics, Indian Institute of Technology Guwahati (roll no. 250102242).
Current B.Tech CGPA 9.52, Math minor CGPA 9.00. Senior secondary (WBCHSE
board): 95.0%.

Skills: C++, Python, C. Libraries/tools: PyTorch, NumPy, Pandas, Scikit-learn,
UMAP, yfinance, PyPortfolioOpt, LangChain, FastAPI, Streamlit, Neo4j,
ChromaDB, Git, LaTeX. Key concepts: Deep Learning, Transformers, LSTM &
Attention, Stochastic Calculus, Modern Portfolio Theory, DSA, Game Theory,
Risk Modeling.

Projects:
- Prag-Dristi (Apr 2026–present): Assam flood forecasting engine. LSTM
  encoder-decoder with Bahdanau attention for 7-day Brahmaputra discharge
  forecasting on 23 years of ERA5/GloFAS data. NSE 0.924, KGE 0.920, POD
  0.651 on unseen years. FastAPI backend + Streamlit dashboard.
- MemoryOS (Feb 2026–present): persistent memory framework for stateless
  LLMs. Three-tier memory (Neo4j graph, ChromaDB vectors, active buffer)
  with automatic entity resolution; sustains 4,000+ turns at ~350
  tokens/turn, 99.8% token savings vs. linear history.
- Hackathon-Squad (Apr 2026): C++ solver for the NP-hard Maximum Weight
  Independent Set problem — kernelization, Nemhauser-Trotter LP reduction
  via Dinic max-flow, hybrid exact tree-DP / iterated local search. 23/23
  valid benchmark solutions.
- Minimum-Variance Portfolio Optimizer (Dec 2025–present): quantitative
  pipeline for lowest-risk long-only portfolios using Ledoit-Wolf shrinkage
  and nearest-PSD covariance correction.
- Kelly Criterion for Fixed-Limit Games (Dec 2025–Jan 2026): derived the
  "Stochastic Gate," converting the optimal Kelly fraction into a Kelly
  Frequency for fixed-bet games.
- Automated Competitive Programming Archive (Apr 2026–present): Python
  archiver using the Codeforces REST API, auto-generates a Markdown
  README cataloguing 250+ accepted C++ submissions by rating and tag.

Positions: Deputy Coordinator, Coding Club IIT Guwahati (Competitive
Programming Module), since Jan 2026. Associate, Consulting & Analytics Club
IIT Guwahati, since Dec 2025.

Achievements: Gold Medal, Kriti 2026 AI Challenge (IIT Guwahati). Rank 199,
AMS Derive 2026 PRIOR round. JEE Advanced 2025: All India Rank 1941 (top 1%
of 1.5 lakh+ candidates). JEE Main 2025: All India Rank 4738 (99.69
percentile). Codeforces Specialist, CodeChef 2-Star, 250+ problems solved.

Blog — "let down and hanging around" (name borrowed from the Radiohead song
"Let Down"), competitive programming / math / systems write-ups:
- "Bin Packing — Why It's Hard, How to Approximate It, and When It Isn't
  Hard At All" — NP-hardness proof, classical approximation algorithms with
  bounds, polynomial special cases, bitmask-DP for small instances.
- "Why My PBDS ordered_multiset Solution TLE'd (and the Fenwick Fix)" — Red-
  Black trees and order statistics vs. Fenwick trees, on Codeforces 1097B.
- "Stack, Heap, and the Registers That Finally Made Sense" — his first blog
  post, digging into how the stack/heap actually work in C++ underneath.

Site navigation (hash routes): "/" résumé home, "/education", "/projects",
"/gallery", "/skills", "/positions", "/achievements", "/about", "/blogs" the
blog, "/codeforces" live Codeforces stats, "/github" GitHub activity/repos.

Contact: priyanshuib01@gmail.com, GitHub github.com/PriyanshuIITGHY2006,
LinkedIn linkedin.com/in/priyanshu-debnath-3a81711b3, Codeforces handle
PriyanshuIITGHY2006.
`.trim()

const SYSTEM_PROMPT = `You are the assistant embedded on Priyanshu Debnath's personal portfolio and blog website. You help visitors find things and answer questions about Priyanshu, his projects, education, skills, achievements, and blog posts.

Rules:
- Only answer using the information given below. Don't invent facts.
- If asked something unrelated to Priyanshu or this website, politely say you're only here to help with this site, and don't answer the unrelated question.
- Keep answers short: 2-4 sentences unless the question genuinely needs more.
- When it helps, point to the relevant page (e.g. "see the Projects page" or "check out /blogs").
- Talk about Priyanshu in the third person, like a knowledgeable guide to his site, not as if you are him.

Site knowledge:
${SITE_KNOWLEDGE}`

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

async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")!
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`assistant-session-v1:${secret}`))
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

interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

function sanitizeHistory(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (t): t is ChatTurn =>
        t &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.content === "string" &&
        t.content.length > 0 &&
        t.content.length <= MAX_MESSAGE_LENGTH,
    )
    .slice(-MAX_HISTORY_TURNS)
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://priyanshuiitghy2006.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-turnstile-token, x-assistant-session",
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  const verificationRequired = (message: string) => json({ error: message, code: "VERIFICATION_REQUIRED" }, 401)

  try {
    const sessionHeader = req.headers.get("x-assistant-session")
    let session = sessionHeader ? await verifySessionToken(sessionHeader) : null

    if (session && session.count >= MAX_TURNS_PER_SESSION) {
      session = null
    }

    if (!session) {
      const turnstileToken = req.headers.get("x-turnstile-token")
      if (!turnstileToken) {
        return verificationRequired("Anti-bot verification required.")
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
        return verificationRequired("Bot verification failed.")
      }

      const now = Date.now()
      session = { iat: now, exp: now + SESSION_TTL_MS, count: 0 }
    }

    const body = await req.json()
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message) return json({ error: "Message is required." }, 400)
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: `Keep it under ${MAX_MESSAGE_LENGTH} characters.` }, 400)
    }
    const history = sanitizeHistory(body.history)

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message },
    ]

    const modelResponse = await fetch(GITHUB_MODELS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("GITHUB_MODELS_TOKEN")!}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 400,
      }),
    })

    if (!modelResponse.ok) {
      const status = modelResponse.status
      if (status === 429) {
        return json({ error: "The assistant is getting a lot of questions right now — try again in a moment." }, 429)
      }
      const errText = await modelResponse.text().catch(() => "")
      console.error("GitHub Models error", status, errText)
      return json({ error: "The assistant couldn't answer that just now." }, 502)
    }

    const data = await modelResponse.json()
    const reply = data?.choices?.[0]?.message?.content
    if (typeof reply !== "string" || !reply.trim()) {
      return json({ error: "The assistant couldn't answer that just now." }, 502)
    }

    session.count += 1
    const nextToken = await createSessionToken(session)

    return json({
      reply: reply.trim(),
      session: nextToken,
      sessionExpiresAt: session.exp,
      turnsRemaining: MAX_TURNS_PER_SESSION - session.count,
    })
  } catch (error) {
    console.error("site-assistant error", error)
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 400)
  }
})
