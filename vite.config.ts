import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite must NOT try to process the classic Pyodide worker as an ES module
  worker: {
    format: "iife", // classic worker format
  },
  // Required for Pyodide: cross-origin isolation (SharedArrayBuffer)
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // Prevent Vite from trying to bundle @monaco-editor/react's large worker files
  optimizeDeps: {
    exclude: ["@monaco-editor/react"],
  },
});
