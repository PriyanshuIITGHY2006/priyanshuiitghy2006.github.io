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

export function isCompilerConfigured(): boolean {
  return Boolean(import.meta.env.VITE_ONLINE_COMPILER_KEY);
}

export async function runCode(
  compilerId: string,
  sourceCode: string,
  stdin: string,
): Promise<CompilerResult> {
  const key = import.meta.env.VITE_ONLINE_COMPILER_KEY as string | undefined;
  if (!key) throw new Error("missing-key");

  const res = await fetch("https://api.onlinecompiler.io/api/run-code-sync/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": key,
    },
    body: JSON.stringify({ compiler: compilerId, code: sourceCode, input: stdin }),
  });

  if (res.status === 429) throw new Error("rate-limit");
  if (!res.ok) throw new Error(`compiler-http-${res.status}`);
  
  return (await res.json()) as CompilerResult;
}
