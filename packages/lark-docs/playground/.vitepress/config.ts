import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitepress";
import { buildNav, buildSidebar, installMermaidFence, MERMAID_TAG } from "@lark.js/docs";

export default defineConfig({
  title: "Playground",
  description: "@lark.js/docs playground",
  srcDir: "docs",
  themeConfig: {
    nav: buildNav("docs"),
    sidebar: buildSidebar("docs"),
  },
  markdown: { config: installMermaidFence },
  vue: {
    template: {
      compilerOptions: { isCustomElement: (tag) => tag === MERMAID_TAG },
    },
  },
  vite: {
    // @ts-expect-error
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@lark.js/docs"],
      include: ["@lark.js/docs > mermaid"],
    },
    ssr: { noExternal: ["@lark.js/docs"] },
  },
});
