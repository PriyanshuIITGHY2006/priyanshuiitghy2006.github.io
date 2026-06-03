import { defineConfig } from "vite";

// Deployed at https://priyanshuiitghy2006.github.io/ (user-pages root site),
// so the base path is "/".
export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
});
