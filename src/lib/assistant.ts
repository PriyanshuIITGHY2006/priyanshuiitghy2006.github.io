// Client for the site-wide "ask about Priyanshu" chat assistant
// (supabase/functions/site-assistant). Mirrors compiler.ts's Turnstile +
// signed-session pattern: solve once, reuse the session token for a bounded
// number of turns before being asked to verify again.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantReply {
  reply: string;
  /** Hash route (e.g. "#/projects") the assistant wants the visitor sent to, if it called the navigate_to tool. */
  navigateTo?: string | null;
  session?: string;
  sessionExpiresAt?: number;
  turnsRemaining?: number;
}

export interface AssistantAuth {
  turnstileToken?: string;
  session?: string;
}

export class VerificationRequiredError extends Error {
  readonly code = "VERIFICATION_REQUIRED" as const;
  constructor(message: string) {
    super(message);
    this.name = "VerificationRequiredError";
  }
}

const ASSISTANT_URL = "https://vadbagtnekrjwrimvgxe.supabase.co/functions/v1/site-assistant";

export async function askAssistant(
  message: string,
  history: ChatTurn[],
  auth: AssistantAuth = {},
): Promise<AssistantReply> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(ASSISTANT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        "X-Turnstile-Token": auth.turnstileToken || "",
        "X-Assistant-Session": auth.session || "",
      },
      body: JSON.stringify({ message, history }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      if (response.status === 401 && errorBody?.code === "VERIFICATION_REQUIRED") {
        throw new VerificationRequiredError(errorBody.error || "Verification required");
      }
      throw new Error(errorBody?.error || `Request failed (${response.status})`);
    }

    return (await response.json()) as AssistantReply;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof VerificationRequiredError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new Error("Timed out — try again.");
    throw error instanceof Error ? error : new Error("Connection error");
  }
}

const SESSION_KEY = "site-assistant-session";

interface StoredSession {
  token: string;
  expiresAt: number;
}

export function getAssistantSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.token || typeof parsed.expiresAt !== "number" || Date.now() >= parsed.expiresAt) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function setAssistantSession(token: string, expiresAt: number): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    // Storage unavailable — session just won't persist across reloads.
  }
}

export function clearAssistantSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
