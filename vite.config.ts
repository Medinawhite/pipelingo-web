/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works on GitHub Pages under /<repo>/ and on any static host.
  base: "./",
  // Content (all questions) and the app shell share the main chunk; labs load on their own.
  build: { chunkSizeWarningLimit: 700 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
