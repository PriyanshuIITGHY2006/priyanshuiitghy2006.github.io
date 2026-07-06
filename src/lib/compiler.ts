// src/lib/compiler.ts

export interface CompilerResult {
  output: string;
  error: string;
  status: "success" | "error";
  exit_code: number;
  time: string;
  total: string;
  memory: string;
}

// Since the API key is now safely on the backend, the frontend is always "configured"
export function isCompilerConfigured(): boolean {
  return true; 
}

export async function runCode(
  compilerId: string,
  sourceCode: string,
  stdin: string,
): Promise<CompilerResult> {
  const PROXY_URL = "https://vadbagtnekrjwrimvgxe.supabase.co/functions/v1/smooth-endpoint";

  // Replicate your original 35-second safety timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    // Grab the token injected into the DOM by the Turnstile widget
    const turnstileToken = (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement)?.value;

    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        "X-Turnstile-Token": turnstileToken || "" // Pass it to the Edge Function
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
      const errorData = await response.text();
      throw new Error(`Execution Failed: ${response.status} - ${errorData}`);
    }

    const result: CompilerResult = await response.json();
    return result;

  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle the specific timeout abort error
    if (error instanceof Error && error.name === "AbortError") {
      return Promise.reject(new Error("timeout"));
    }
    
    return Promise.reject(
      new Error(error instanceof Error ? error.message : "Connection Error")
    );
  }
}
