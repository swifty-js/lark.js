// !!! For your project, it should be: import { defineConfig } from "@lark.js/docs/vite";
import { defineConfig } from "./src/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/",
  title: "Lark Docs",
  description: "@lark.js/docs -- Documentation site generator",
  nav: [
    { text: "Lark Next", link: "/lark-mvc/" },
    { text: "Lark Docs", link: "/lark-docs/" },
  ],
  sidebar: {
    "/lark-mvc/": "auto",
    "/lark-docs/": "auto",
  },
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: true,
});
