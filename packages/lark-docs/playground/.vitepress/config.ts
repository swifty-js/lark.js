import tailwindcss from "@tailwindcss/vite";
import { defineDocsConfig } from "@lark.js/docs";

export default defineDocsConfig({
  title: "Playground",
  description: "@lark.js/docs playground",
  srcDir: "docs",
  vite: {
    // @ts-expect-error
    plugins: [tailwindcss()],
  },
});
