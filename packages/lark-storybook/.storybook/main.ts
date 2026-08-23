import type { StorybookConfig } from "@storybook/html-vite";
import { larkMvcPlugin } from "@lark.js/mvc/vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * Storybook uses the plain HTML renderer (stories return DOM nodes) plus two
 * Vite plugins:
 *
 * - `larkMvcPlugin` defaults esbuild to the Lark automatic JSX runtime
 *   (`jsxImportSource: "@lark.js/mvc"`) and injects state-preserving view HMR
 *   into every `defineView` module. It has no dependency on an app entry or
 *   an index.html, so adding it to the builder's config is enough.
 * - `@tailwindcss/vite` compiles `src/styles/global.css` (the `@theme` token
 *   source) and resolves the `@apply` rules inside every `*.module.css`.
 */
const config: StorybookConfig = {
  framework: {
    name: "@storybook/html-vite",
    options: {},
  },
  stories: ["../src/**/*.stories.ts"],
  addons: [],
  viteFinal(viteConfig, options) {
    viteConfig.plugins = [
      larkMvcPlugin(),
      tailwindcss(),
      ...(viteConfig.plugins ?? []),
    ];
    return viteConfig;
  },
};

export default config;
