import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  root: "apps/observatory",
  plugins: [react()],
  define: { __FIXTURE__: JSON.stringify(mode === "fixture") },
  server: {
    host: "127.0.0.1",
    proxy: { "/api": process.env.OBSERVATORY_API || "http://127.0.0.1:8000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
}));
