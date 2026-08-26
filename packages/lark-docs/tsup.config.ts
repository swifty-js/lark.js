import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/theme.ts", "src/element.ts"],
  clean: true,
  dts: true,
  format: ["esm"],
  splitting: true,
  minify: false,
  sourcemap: false,
  tsconfig: "./tsconfig.build.json",
});
