import type { StorybookConfig } from "@storybook/html-vite";
import { larkMvcPlugin } from "@lark.js/mvc/vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * Storybook uses the plain HTML renderer (stories return DOM nodes) plus two
 * Vite plugins:
 *
 * - `larkMvcPlugin` turns `import template from "./x.html"` into a compiled
 *   render function and injects template/view HMR. It has no dependency on an
 *   app entry or an index.html, so adding it to the builder's config is enough.
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
      // `enforce: "pre"` inside the plugin keeps it ahead of Vite's own asset
      // handling for `.html` imports.
      larkMvcPlugin(),
      tailwindcss(),
      ...(viteConfig.plugins ?? []),
    ];

    // Vite 8's Rolldown dependency scanner resolves ids through plugins but does
    // NOT run their `load` hooks, so it tries to read the plugin's virtual
    // `<file>.html?lark-template` id from disk and the cold start logs
    // "Failed to run dependency scan". Storybook already lists its own
    // dependencies in `optimizeDeps.include`, and anything else is optimized on
    // demand, so switching the scanner off is the cheapest correct fix.
    viteConfig.optimizeDeps = { ...viteConfig.optimizeDeps, noDiscovery: true };
    return viteConfig;
  },
};

export default config;
