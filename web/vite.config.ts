import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA, no backend. Base is relative so it deploys cleanly on
// Vercel/Netlify or from a sub-path.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", assetsInlineLimit: 4096 },
});
