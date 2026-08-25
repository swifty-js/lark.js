import { larkMvcPlugin } from "@lark.js/mvc/vite";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

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
  base: "/lark.js/",
  plugins: [larkMvcPlugin(), tailwindcss(), copy404()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
});
