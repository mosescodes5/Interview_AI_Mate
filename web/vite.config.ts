/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: false, host: "127.0.0.1", proxy: { "/api": API, "/health": API } },
  test: { environment: "jsdom", globals: true },
});
