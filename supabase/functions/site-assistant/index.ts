// Site-wide "ask me anything about Priyanshu" chat assistant. Gated by the
// same Turnstile + signed-session pattern as smooth-endpoint.ts (solve once,
// reuse the session for a bounded number of turns / time window) so this
// doesn't become a free, unmetered proxy to the model behind it.
//
// The model is served by GitHub Models (models.github.ai) rather than Azure
// OpenAI — Azure OpenAI itself is blocked on Azure for Students subscriptions
// regardless of region, so this uses GitHub's free inference API instead,
// which speaks the same OpenAI-style chat-completions shape, including
// function/tool calling (see TOOLS below).
//
// Site knowledge is a hand-maintained snapshot below, not a live fetch —
// keep it in sync with src/data/resume.ts, src/data/projects.ts, and
// src/data/blogs/*.md when those change. Anything that actually changes
// over time (Codeforces rating, new blog posts) is answered via a live
// tool call instead of being baked into the snapshot.

const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_TURNS_PER_SESSION = 30
const MAX_MESSAGE_LENGTH = 500
const MAX_HISTORY_TURNS = 6
const MAX_TOOL_ROUNDS = 3

const MODEL = "openai/gpt-4o-mini"
const GITHUB_MODELS_URL = "https://models.github.ai/inference/chat/completions"
const CF_HANDLE = "PriyanshuIITGHY2006"
const SITE_ORIGIN = "https://priyanshuiitghy2006.github.io"

// ─── Tools the model can call mid-conversation ──────────────────────────────
// Two are genuinely live data (fetched fresh on every call, not baked into
// SITE_KNOWLEDGE below); the third is a UI side effect — the edge function
// can't navigate anything itself, so it just reports the requested route
// back to the frontend, which performs the actual hash change.
const NAV_ROUTES = [
  "/", "/resume", "/education", "/projects", "/gallery", "/skills",
  "/positions", "/achievements", "/blogs", "/codeforces", "/github",
] as const

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_codeforces_stats",
      description: "Fetch Priyanshu's current live Codeforces rating, rank, and max rating. Use this whenever asked about his current/live competitive programming rating or rank, instead of guessing from static knowledge.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_blog_posts",
      description: "Fetch the current list of published blog posts (title, url, publish date), newest first. Use this whenever asked what Priyanshu has written recently, or to list/recommend blog posts.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "integer", description: "How many recent posts to return, default 5, max 20." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to",
      description: "Send the visitor to a specific page of the site. Use this whenever the user asks to see, go to, open, or be taken to a page, project, or blog post.",
      parameters: {
        type: "object",
        properties: {
          route: { type: "string", enum: NAV_ROUTES as unknown as string[], description: "The static route to navigate to." },
          slug: { type: "string", description: "Blog post slug, only when route is \"/blogs\" and a specific post was requested — will link to #/blog?slug=<slug> instead." },
          projectId: { type: "string", description: "Project id, only when route is \"/projects\" and a specific project was requested — will link to #/project?id=<projectId> instead." },
        },
        required: ["route"],
      },
    },
  },
]

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

Site navigation (hash routes): "/" home (the About page — bio, site map,
contact form), "/resume" the traditional one-page résumé view, "/education",
"/projects", "/gallery", "/skills", "/positions", "/achievements", "/blogs"
the blog, "/codeforces" live Codeforces stats, "/github" GitHub activity/repos.

Contact: priyanshuib01@gmail.com, GitHub github.com/PriyanshuIITGHY2006,
LinkedIn linkedin.com/in/priyanshu-debnath-3a81711b3, Codeforces handle
PriyanshuIITGHY2006.
`.trim()

const SYSTEM_PROMPT = `You are the assistant embedded on Priyanshu Debnath's personal portfolio and blog website. You help visitors find things and answer questions about Priyanshu, his projects, education, skills, achievements, and blog posts — and you can act, not just answer: you have tools to fetch his live Codeforces stats, list current blog posts, and send the visitor to a specific page.

Rules:
- Only answer using the information given below, plus whatever your tools return. Don't invent facts, and don't invent numbers a tool could give you — call the tool instead.
- Use get_codeforces_stats for anything about his current/live rating or rank rather than guessing from the static numbers below (those may be stale).
- Use list_blog_posts when asked what he's written, recently, or for a recommendation — don't rely on the static list below for that.
- Use navigate_to whenever the user asks to see, open, go to, or be taken to a page, project, or blog post — actually call it, don't just describe the page in text.
- If asked something unrelated to Priyanshu or this website, politely say you're only here to help with this site, and don't answer the unrelated question.
- Keep answers short: 2-4 sentences unless the question genuinely needs more.
- Talk about Priyanshu in the third person, like a knowledgeable guide to his site, not as if you are him.

Site knowledge (static; may be stale for anything a tool can fetch live):
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

// ─── Tool execution ──────────────────────────────────────────────────────
async function getCodeforcesStats(): Promise<string> {
  try {
    const res = await fetch(`https://codeforces.com/api/user.info?handles=${CF_HANDLE}`)
    const data = await res.json()
    if (data.status !== "OK") return JSON.stringify({ error: "Codeforces API unavailable right now." })
    const u = data.result[0]
    return JSON.stringify({
      handle: u.handle,
      rating: u.rating ?? null,
      rank: u.rank ?? null,
      maxRating: u.maxRating ?? null,
      maxRank: u.maxRank ?? null,
    })
  } catch {
    return JSON.stringify({ error: "Codeforces API unavailable right now." })
  }
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

async function listBlogPosts(count: number): Promise<string> {
  try {
    const res = await fetch(`${SITE_ORIGIN}/feed.xml`)
    const xml = await res.text()
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, count).map((m) => {
      const block = m[1]
      const title = xmlUnescape(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? "")
      const link = xmlUnescape(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? "")
      const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1] ?? ""
      return { title, link, pubDate }
    })
    return JSON.stringify({ posts: items })
  } catch {
    return JSON.stringify({ error: "Couldn't fetch the blog post list right now." })
  }
}

interface NavRequest {
  route: string
  slug?: string
  projectId?: string
}

function navigateTo(args: NavRequest): { result: string; nav: string | null } {
  if (!NAV_ROUTES.includes(args.route as (typeof NAV_ROUTES)[number])) {
    return { result: JSON.stringify({ error: "Unknown route." }), nav: null }
  }
  let hash = `#${args.route}`
  if (args.route === "/blogs" && args.slug) hash = `#/blog?slug=${encodeURIComponent(args.slug)}`
  if (args.route === "/projects" && args.projectId) hash = `#/project?id=${encodeURIComponent(args.projectId)}`
  return { result: JSON.stringify({ status: "ok", route: hash }), nav: hash }
}

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

/** Runs every tool call from one model turn, returns their result messages plus any nav route requested. */
async function runToolCalls(toolCalls: ToolCall[]): Promise<{ messages: Array<Record<string, unknown>>; navigateTo: string | null }> {
  let nav: string | null = null
  const messages: Array<Record<string, unknown>> = []

  for (const call of toolCalls) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || "{}")
    } catch {
      // malformed arguments — fall through with an empty args object
    }

    let result: string
    switch (call.function.name) {
      case "get_codeforces_stats":
        result = await getCodeforcesStats()
        break
      case "list_blog_posts": {
        const count = Math.min(Math.max(Number(args.count) || 5, 1), 20)
        result = await listBlogPosts(count)
        break
      }
      case "navigate_to": {
        const nr = navigateTo(args as unknown as NavRequest)
        result = nr.result
        if (nr.nav) nav = nr.nav
        break
      }
      default:
        result = JSON.stringify({ error: "Unknown tool." })
    }

    messages.push({ role: "tool", tool_call_id: call.id, content: result })
  }

  return { messages, navigateTo: nav }
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

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message },
    ]

    let navigateToRoute: string | null = null
    let finalReply: string | null = null

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const modelResponse = await fetch(GITHUB_MODELS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("GITHUB_MODELS_TOKEN")!}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
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
      const choice = data?.choices?.[0]?.message

      const toolCalls: ToolCall[] | undefined = choice?.tool_calls
      if (toolCalls && toolCalls.length > 0) {
        messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: toolCalls })
        const { messages: toolResults, navigateTo: nav } = await runToolCalls(toolCalls)
        if (nav) navigateToRoute = nav
        messages.push(...toolResults)
        continue // let the model see the tool results and respond
      }

      if (typeof choice?.content === "string" && choice.content.trim()) {
        finalReply = choice.content.trim()
      }
      break
    }

    if (!finalReply) {
      return json({ error: "The assistant couldn't answer that just now." }, 502)
    }

    session.count += 1
    const nextToken = await createSessionToken(session)

    return json({
      reply: finalReply,
      navigateTo: navigateToRoute,
      session: nextToken,
      sessionExpiresAt: session.exp,
      turnsRemaining: MAX_TURNS_PER_SESSION - session.count,
    })
  } catch (error) {
    console.error("site-assistant error", error)
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 400)
  }
})
