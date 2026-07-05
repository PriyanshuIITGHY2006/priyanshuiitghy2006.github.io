// src/lib/compiler.ts
import { io } from "socket.io-client";

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

export function runCode(
  compilerId: string,
  sourceCode: string,
  stdin: string,
): Promise<CompilerResult> {
  const key = import.meta.env.VITE_ONLINE_COMPILER_KEY as string | undefined;
  
  if (!key) {
    return Promise.reject(new Error("missing-key"));
  }

  return new Promise((resolve, reject) => {
    // Connect to the WebSocket server using your Widget key
    const socket = io("wss://api.onlinecompiler.io", {
      auth: { token: key },
      transports: ["websocket"] // Force websockets to avoid CORS polling
    });

    // Safety timeout: The API has a 30s limit, so we kill the socket if it hangs for 35s
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("timeout"));
    }, 35000);

    socket.on("connect", () => {
      // Send the code execution payload
      socket.emit("runcode", {
        api_key: key,
        compiler: compilerId,
        code: sourceCode,
        input: stdin,
      });
    });

    socket.on("codeoutput", (result: CompilerResult) => {
      clearTimeout(timeout);
      socket.disconnect();
      resolve(result); // Return the result back to blog-post.ts
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(new Error(`WebSocket Connection Error: ${err.message}`));
    });
  });
}
