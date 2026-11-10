// File note: This file handles vite.config.js.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL("../assets", import.meta.url)),
});
