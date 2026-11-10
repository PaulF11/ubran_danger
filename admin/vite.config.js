// File note: This file handles vite.config.js.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const apiTarget =
  process.env.VITE_API_BASE_URL || "https://urbandanger.netlify.app";

export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL("../assets", import.meta.url)),
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
