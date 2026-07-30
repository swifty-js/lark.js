import { defineConfig } from "vite";
import { larkMvcPlugin } from "@lark.js/mvc/vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/lark.js/" : "/",
  root: resolve(dirname(fileURLToPath(import.meta.url)), "src"),
  plugins: [larkMvcPlugin({ vdom: false, debug: true }), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  build: {
    outDir: resolve(dirname(fileURLToPath(import.meta.url)), "dist"),
    emptyOutDir: true,
  },
}));
