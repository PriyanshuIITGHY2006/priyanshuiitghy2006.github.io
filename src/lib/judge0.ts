// Thin client for Judge0 CE, used to let readers run "runnable" code blocks
// directly in a blog post. Requires a RapidAPI key for the Judge0 CE API
// (free tier available): https://rapidapi.com/judge0-official/api/judge0-ce
//
// IMPORTANT: this is a fully static site with no backend, so the key is
// baked into the built JS bundle via Vite's env-var substitution — anyone
// who opens dev tools can read it. That's an accepted trade-off (the same
// one this site already makes with its Supabase anon key), but it does mean
// your RapidAPI quota is effectively public. Keep it on the free tier and
// treat quota exhaustion as a possibility, not a bug.

export interface Judge0Result {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  status: { id: number; description: string };
}

const JUDGE0_ENDPOINT = "https://judge0-ce.p.rapidapi.com/submissions";
const RAPIDAPI_HOST = "judge0-ce.p.rapidapi.com";

function getApiKey(): string | undefined {
  return import.meta.env.VITE_JUDGE0_KEY as string | undefined;
}

export function isJudge0Configured(): boolean {
  return Boolean(getApiKey());
}

export async function runOnJudge0(
  languageId: number,
  sourceCode: string,
  stdin: string,
): Promise<Judge0Result> {
  const key = getApiKey();
  if (!key) throw new Error("missing-key");

  const res = await fetch(`${JUDGE0_ENDPOINT}?base64_encoded=false&wait=true`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
    body: JSON.stringify({ source_code: sourceCode, language_id: languageId, stdin }),
  });

  if (!res.ok) throw new Error(`judge0-http-${res.status}`);
  return (await res.json()) as Judge0Result;
}
