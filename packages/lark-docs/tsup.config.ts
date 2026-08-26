import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: [
  ],
  clean: true,
  dts: true,
  format: ["esm", "cjs"],
  minify: false,
  sourcemap: false,
  external: [
  ],
  tsconfig: "./tsconfig.build.json",
  onSuccess: async () => {
  },
});
