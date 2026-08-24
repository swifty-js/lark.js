import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: [
    "src/index.tsx",
    "src/vite.ts",
    "src/compiler.ts",
    "src/runtime.ts",
    "src/theme.ts",
    "src/plugins.ts",
  ],
  clean: true,
  dts: true,
  format: ["esm", "cjs"],
  minify: false,
  sourcemap: false,
  external: [
    "@swifty.js/docs",
    "@swifty.js/anti-copy",
    "@swifty.js/sentry",
    "react",
    "react-dom",
    "vite",
    "tailwindcss",
  ],
  tsconfig: "./tsconfig.build.json",
  onSuccess: async () => {
    const dist = join(root, "dist");
    mkdirSync(dist, { recursive: true });
    copyFileSync(
      join(root, "node_modules/@swifty.js/docs/dist/client.css"),
      join(dist, "client.css"),
    );
  },
});
