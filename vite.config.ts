import { defineConfig } from "vite";

// Deployed at https://priyanshudebnath.me/ (user-pages root site),
// so the base path is "/".
export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
});
