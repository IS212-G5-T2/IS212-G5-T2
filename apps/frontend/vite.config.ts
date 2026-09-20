import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    coverage: {
      thresholds: {
        "src/pages/LoginPage.tsx": { 100: true },
        "src/components/auth/Require*.tsx": { 100: true },
        "src/lib/firebaseRoles.ts": { 100: true },
      },
    },
  },
});
