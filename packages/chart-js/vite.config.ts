import { larkMvcPlugin } from "@lark.js/mvc/vite";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * GitHub Pages SPA fallback: copy index.html to 404.html after build so a
 * hard refresh on a deep route (/lark-homepage/projects) serves the app
 * shell instead of GitHub's 404 page.
 */
function copy404(): Plugin {
  let outDir = "dist";
  return {
    name: "copy-404",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const index = resolve(outDir, "index.html");
      if (!existsSync(index)) return;
      writeFileSync(resolve(outDir, "404.html"), readFileSync(index));
    },
  };
}

export default defineConfig({
  // Canonical base form ("/x/", not "x") so import.meta.env.BASE_URL ends
  // with a slash — MSW joins its worker URL onto it (see main.tsx).
  base: "/lark.js/",
  plugins: [larkMvcPlugin(), tailwindcss(), copy404()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
});
