import { defineConfig } from "vite";

// Served at https://priyanshudebnath.me/admin/. The deploy workflow builds
// Hugo into ../public first, then this into ../public/admin.
export default defineConfig({
  base: "/admin/",
  build: {
    outDir: "../public/admin",
    emptyOutDir: true,
    target: "es2022",
  },
});
