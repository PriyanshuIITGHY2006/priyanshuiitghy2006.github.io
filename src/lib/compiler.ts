// src/lib/compiler.ts

export interface CompilerResult {
  output: string;
  error: string;
  status: "success" | "error";
  exit_code: number;
  time: string;
  total: string;
  memory: string;
  // Present once a run succeeds: a signed session that lets subsequent runs
  // skip re-solving Turnstile until it expires or its run budget is spent.
  session?: string;
  sessionExpiresAt?: number;
  runsRemaining?: number;
}

export interface RunCodeAuth {
  turnstileToken?: string;
  runSession?: string;
}

/** Thrown when the backend needs a fresh Turnstile solve (no/expired/exhausted session). */
export class VerificationRequiredError extends Error {
  readonly code = "VERIFICATION_REQUIRED" as const;
  constructor(message: string) {
    super(message);
    this.name = "VerificationRequiredError";
  }
}

// Since the API key is now safely on the backend, the frontend is always "configured"
export function isCompilerConfigured(): boolean {
  return true;
}

export async function runCode(
  compilerId: string,
  sourceCode: string,
  stdin: string,
  auth: RunCodeAuth = {},
): Promise<CompilerResult> {
  const PROXY_URL = "https://vadbagtnekrjwrimvgxe.supabase.co/functions/v1/smooth-endpoint";

  // Replicate your original 35-second safety timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        "X-Turnstile-Token": auth.turnstileToken || "",
        "X-Run-Session": auth.runSession || "",
      },
      body: JSON.stringify({
        compiler: compilerId,
        code: sourceCode,
        input: stdin,
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      if (response.status === 401 && errorBody?.code === "VERIFICATION_REQUIRED") {
        throw new VerificationRequiredError(errorBody.error || "Verification required");
      }
      throw new Error(`Execution Failed: ${response.status} - ${errorBody ? JSON.stringify(errorBody) : ""}`);
    }

    const result: CompilerResult = await response.json();
    return result;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof VerificationRequiredError) {
      return Promise.reject(error);
    }

    // Handle the specific timeout abort error
    if (error instanceof Error && error.name === "AbortError") {
      return Promise.reject(new Error("timeout"));
    }

    return Promise.reject(
      new Error(error instanceof Error ? error.message : "Connection Error")
    );
  }
}
