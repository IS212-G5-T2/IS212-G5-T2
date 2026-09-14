import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
      {
        find: /^@testing-library\/react$/,
        replacement: require.resolve("@testing-library/react"),
      },
      {
        find: /^@testing-library\/user-event$/,
        replacement: require.resolve("@testing-library/user-event"),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: require.resolve("react/jsx-dev-runtime"),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: require.resolve("react/jsx-runtime"),
      },
      { find: /^react$/, replacement: require.resolve("react") },
      { find: /^react-dom$/, replacement: require.resolve("react-dom") },
      {
        find: /^react-dom\/client$/,
        replacement: require.resolve("react-dom/client"),
      },
      {
        find: /^react-router-dom$/,
        replacement: require.resolve("react-router-dom"),
      },
    ],
  },
  server: {
    port: 5173,
    fs: {
      allow: ["../.."],
    },
  },
});
