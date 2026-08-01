/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Vite configuration for @lark.js/docs.
 *
 * Dual-mode config:
 *   --mode lib   → Library build (7 entries, ESM+CJS+dts)
 *   --mode docs  → Documentation site (generates routes.ts, Vite dev/build)
 *
 * Vite 7 uses Rollup internally, so build.lib is Rollup-based.
 */
import {
  defineConfig,
  type LibraryFormats,
  type PluginOption,
  type UserConfig,
  type Rollup,
} from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";
import { compileTemplate, extractGlobalVars } from "@lark.js/mvc/compiler";
import tailwindcss from "@tailwindcss/vite";
// !!! For your project, it should be:
// import { larkDocsPlugin, docsGuardPlugin } from "@lark.js/docs/vite";
import { larkDocsPlugin, docsGuardPlugin } from "./src/vite";
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { VitePWA } from "vite-plugin-pwa";
/** Documentation site configuration used in docs mode. */
import larkDocsConfig from "./lark-docs.config";
import pkg from "./package.json" with { type: "json" };

// === Shared constants ===

const PKG_DIR = import.meta.dirname;

/** All deps + peerDeps are externalized in lib mode (users install them). */
const EXTERNAL_IDS = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

/**
 * Vite-special import queries, exactly as declared in vite/client.d.ts:
 * `*?raw`, `*?url`, `*?inline`, `*?no-inline`, `*?url&inline`,
 * `*?url&no-inline`, `*?worker`, `*?worker&inline`, `*?worker&url`,
 * `*?sharedworker`, `*?sharedworker&inline`, `*?sharedworker&url`, and
 * `*.wasm?init` (init is only valid on .wasm files). Modules carrying these
 * only exist inside a Vite build — Node cannot load them, so they must be
 * bundled (inlined) rather than externalized, or dist entries crash with
 * ERR_UNKNOWN_FILE_EXTENSION when Node evaluates them during config load.
 */
const VITE_QUERY_RE =
  /(?:\.wasm\?init|\?(?:raw|inline|no-inline|url(?:&(?:inline|no-inline))?|(?:shared)?worker(?:&(?:inline|url))?))$/;

function isExternal(id: string): boolean {
  if (id.startsWith("node:")) return true;
  if (VITE_QUERY_RE.test(id)) return false;
  return EXTERNAL_IDS.some((e) => id === e || id.startsWith(e + "/"));
}

/**
 * __filename / __dirname ESM shims.
 * webpack.ts and rspack.ts use __filename to self-reference as loaders.
 * Injected via Rollup output.banner for ESM chunks only.
 */
const CJS_SHIMS = [
  'import { fileURLToPath as __cjs_fileURLToPath } from "url";',
  'import { dirname as __cjs_dirname } from "path";',
  "const __filename = __cjs_fileURLToPath(import.meta.url);",
  "const __dirname = __cjs_dirname(__filename);",
].join("\n");

// === Mode router ===

export default defineConfig(({ mode }) => {
  if (mode === "lib") {
    return libConfig();
  }
  if (mode === "docs") {
    return docsConfig();
  }
  // Best-effort
  return docsConfig();
});

// === Library build ===

/**
 * Rollup plugin: copies static assets (ejs, client.d.ts, client.css)
 * from src/ to dist/ after each build, and registers them as watch
 * dependencies so changes trigger a rebuild in --watch mode.
 */
function copyAssetsPlugin(): Rollup.Plugin {
  const ASSETS = ["file-content.ejs", "client.d.ts", "client.css"];

  return {
    name: "copy-static-assets",
    buildStart() {
      for (const file of ASSETS) {
        this.addWatchFile(resolve(PKG_DIR, "src", file));
      }
    },
    writeBundle() {
      const srcDir = resolve(PKG_DIR, "src");
      const distDir = resolve(PKG_DIR, "dist");
      for (const file of ASSETS) {
        const src = resolve(srcDir, file);
        const dest = resolve(distDir, file);
        if (!existsSync(src)) continue;
        if (file === "client.css") {
          // In src/ the @source lines point at the theme sources; in the
          // published package all utility classes live in the stable
          // theme-chunk.js produced by manualChunks.
          const css = readFileSync(src, "utf-8")
            .replace('@source "./theme/*.html";', '@source "./theme-chunk.js";')
            .replace(/@source "\.\/theme\/\*\.ts";\n?/, "");
          writeFileSync(dest, css, "utf-8");
        } else {
          copyFileSync(src, dest);
        }
      }
    },
  };
}

// === themeDualMode: dual-mode template compilation plugin ===

/**
 * Regex matching ES named imports: `import { x as y, ... } from "source";`
 *
 * Used by mergeImports() to split compiled template import lines into
 * (specifiers, sourceModule) pairs so overlapping imports from string-mode
 * and VDOM-mode compilation can be deduplicated per-module.
 *
 * Handles: optional semicolon, both quote styles, aliased specifiers (x as y).
 */
const IMPORT_RE = /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/;

/**
 * Split compiled template output into import lines and function body.
 *
 * compileTemplate() returns ES module source in two possible formats:
 *
 *   Old: `export default function(data, viewId, refData) { ... }`
 *   New: `function __larkTemplate(data, viewId, refData) { ... }`
 *        `export default __larkTemplate;`
 *
 * The new format exists so the auto-injected HMR snippet can reference the
 * template function by name. This function separates imports from body and
 * normalizes both formats into an anonymous function expression suitable
 * for `const __str = function(...) {...}`.
 *
 * Regexes are used instead of `startsWith` so the matching is robust against
 * whitespace variations and does not hardcode the function name (`__larkTemplate`).
 */

/**
 * Matches `export default <identifier>;` — a bare reference to a named
 * function declaration on a preceding line. Does NOT match
 * `export default function(...)` because `function` is followed by `(`
 * (not end-of-line), and the `(?!function\b)` lookahead guards against a
 * multiline `export default function` declaration.
 */
const BARE_EXPORT_RE =
  /^export\s+default\s+(?!function\b)[a-zA-Z_$][\w$]*\s*;?\s*$/;

/**
 * Matches `function <name>(` — a named function declaration. Used to convert
 * to an anonymous `function(` expression so it can be assigned to a const.
 */
const NAMED_FUNC_RE = /^function\s+[a-zA-Z_$][\w$]*\s*\(/;

function splitModule(source: string): {
  imports: string[];
  body: string;
} {
  const lines = source.split("\n");
  const imports: string[] = [];
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("import ")) {
      imports.push(line);
    } else if (BARE_EXPORT_RE.test(line)) {
      // New format: `export default __larkTemplate;` is a bare reference to
      // the named function declaration above. Drop it entirely — the
      // function itself is already captured in the body.
      continue;
    } else {
      let processed = line.replace(/^export\s+default\s+/, "");
      // Convert `function __larkTemplate(` → `function(` so the named
      // function declaration becomes an anonymous function expression.
      // Without this, `const __str = function __larkTemplate(...)` creates
      // a named function expression whose name is inaccessible outside the
      // function body, causing `ReferenceError: __larkTemplate is not defined`.
      processed = processed.replace(NAMED_FUNC_RE, "function(");
      bodyLines.push(processed);
    }
  }
  return { imports, body: bodyLines.join("\n") };
}

/**
 * Merge import statements that share the same source module.
 *
 * String-mode and VDOM-mode compile output import overlapping but not
 * identical specifier sets from the same modules. E.g.:
 *   string: import { encHtml, strSafe, encUri, encQuote, refFn } from "@lark.js/mvc/runtime";
 *   vdom:   import { strSafe, encUri, encQuote, refFn } from "@lark.js/mvc/runtime";
 *
 * This deduplicates per-module and emits one merged import per source.
 */
function mergeImports(allImports: string[]): string[] {
  // Map<sourceModule, Map<localName, importedName>>
  const perModule = new Map<string, Map<string, string>>();

  for (const imp of allImports) {
    const match = imp.match(IMPORT_RE);
    if (!match) continue;

    const specifiers = match[1];
    const source = match[2];

    if (!perModule.has(source)) perModule.set(source, new Map());
    const specMap = perModule.get(source)!;

    for (const spec of specifiers.split(",")) {
      const trimmed = spec.trim();
      if (!trimmed) continue;
      // "x as y" → importedName=x, localName=y; "x" → both=x
      const parts = trimmed.split(/\s+as\s+/);
      const importedName = parts[0].trim();
      const localName = parts.length > 1 ? parts[1].trim() : importedName;
      specMap.set(localName, importedName);
    }
  }

  const result: string[] = [];
  for (const [source, specMap] of perModule) {
    const specs = [...specMap.entries()]
      .map(([local, imported]) =>
        local === imported ? local : `${imported} as ${local}`,
      )
      .join(", ");
    result.push(`import { ${specs} } from "${source}";`);
  }
  return result;
}

/**
 * Vite plugin: compiles theme .html templates in BOTH string and VDOM modes
 * so the bundled theme.js can serve either at runtime depending on the
 * consumer's FrameworkConfig.vdom setting.
 *
 * Uses virtual modules (virtual:lark-docs/<name>) to avoid conflicts with
 * larkMvcPlugin7 which intercepts all .html imports via resolveId. Virtual
 * module IDs never end in .html, so neither larkMvcPlugin7 nor Vite's
 * built-in HTML asset handler can intercept them — no suffix tricks needed.
 *
 * Each virtual module exports { __str, __vdom } — two pre-compiled template
 * functions. Imports from the two compilation modes are merged and
 * deduplicated so shared helpers (@lark.js/mvc/runtime) appear only once.
 */
function themeDualMode(): PluginOption {
  const THEME_DIR = resolve(PKG_DIR, "src", "theme");
  const VIRTUAL_PREFIX = "virtual:lark-docs/";
  // \0 prefix is the Rollup convention for marking resolved IDs as
  // "owned by this plugin" — prevents other plugins from loading them.
  const RESOLVED_PREFIX = "\0virtual:lark-docs/";
  const TEMPLATE_NAMES = [
    "docs-layout",
    "sidebar",
    "toc",
    "search",
    "theme-toggle",
  ];

  return {
    name: "theme-dual-mode",
    enforce: "pre",

    resolveId(source: string) {
      if (source.startsWith(VIRTUAL_PREFIX)) {
        return "\0" + source;
      }
      return undefined;
    },

    async load(id: string) {
      if (!id.startsWith(RESOLVED_PREFIX)) return null;
      const name = id.slice(RESOLVED_PREFIX.length);
      if (!TEMPLATE_NAMES.includes(name)) return null;
      const filePath = resolve(THEME_DIR, name + ".html");
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(filePath, "utf-8");
      const globalVars = await extractGlobalVars(raw);
      const [strResult, vdomResult] = await Promise.all([
        compileTemplate(raw, { globalVars, vdom: false }),
        compileTemplate(raw, { globalVars, vdom: true }),
      ]);
      const strMod = splitModule(strResult);
      const vdomMod = splitModule(vdomResult);
      // Merge and deduplicate import lines across both modes.
      const uniqueImports = mergeImports([
        ...strMod.imports,
        ...vdomMod.imports,
      ]);
      const content = [
        ...uniqueImports,
        "",
        `const __str = ${strMod.body}\n`,
        `const __vdom = ${vdomMod.body}\n`,
        "export { __str, __vdom };",
      ].join("\n");
      return content;
    },
  };
}

function libConfig(): UserConfig {
  // All theme modules (the only code containing Tailwind utility classes,
  // including docs-guard.ts and the compiled virtual template modules) are
  // forced into a single stable chunk so Tailwind can scan exactly one
  // file: the @source "./theme-chunk.js" baked into dist/client.css.
  const themeChunk = (id: string): string | undefined => {
    if (id.includes("/src/theme/") || id.includes("virtual:lark-docs/")) {
      return "theme-chunk";
    }
    // Shared helpers (escape-html, guard) must never be hoisted into
    // theme-chunk: Node-side entries (vite, compiler) import them via
    // compile-markdown, and pulling in theme-chunk would evaluate
    // @lark.js/mvc, which touches `document` at module top level.
    if (id.includes("/src/utils/")) return "utils";
    return undefined;
  };

  const sharedOutput = {
    exports: "named" as const,
    manualChunks: themeChunk,
  };

  return {
    build: {
      lib: {
        cssFileName: "lark-docs",
        entry: {
          index: resolve(PKG_DIR, "src/index.ts"),
          compiler: resolve(PKG_DIR, "src/compiler.ts"),
          vite: resolve(PKG_DIR, "src/vite.ts"),
          webpack: resolve(PKG_DIR, "src/webpack.ts"),
          rspack: resolve(PKG_DIR, "src/rspack.ts"),
          runtime: resolve(PKG_DIR, "src/runtime.ts"),
          theme: resolve(PKG_DIR, "src/theme/index.ts"),
        },
        formats: ["es", "cjs"] satisfies LibraryFormats[],
        fileName: (format: string, entryName: string) =>
          format === "es" ? `${entryName}.js` : `${entryName}.cjs`,
      },
      rollupOptions: {
        external: isExternal,
        output: [
          {
            ...sharedOutput,
            format: "es",
            entryFileNames: "[name].js",
            chunkFileNames: (chunk) =>
              chunk.name === "theme-chunk"
                ? "theme-chunk.js"
                : "chunks/[name]-[hash].js",
          },
          {
            ...sharedOutput,
            format: "cjs",
            entryFileNames: "[name].cjs",
            chunkFileNames: (chunk) =>
              chunk.name === "theme-chunk"
                ? "theme-chunk.cjs"
                : "chunks/[name]-[hash].cjs",
          },
        ],
      },
      outDir: "dist",
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
    },
    plugins: [
      // Compile .html template imports in theme/ into JS functions in BOTH
      // string and VDOM modes so consumers can use either rendering mode.
      themeDualMode() as PluginOption,
      {
        name: "cjs-shims",
        renderChunk(code, _chunk, outputOptions) {
          if (outputOptions.format !== "es") return null;
          // Only inject __filename/__dirname shims when the chunk actually
          // references them (webpack.ts and rspack.ts use __filename as a
          // loader self-reference). Browser-targeted chunks (theme, runtime,
          // index) must not import Node.js built-in modules (url, path).
          if (!/\b__(?:filename|dirname)\b/.test(code)) return null;
          return CJS_SHIMS + "\n" + code;
        },
      },
      dts({
        tsconfigPath: "./tsconfig.build.json",
        outDirs: "dist",
      }),
      copyAssetsPlugin() as PluginOption,
    ],
  };
}

// === Documentation site build ===

function docsConfig(): UserConfig {
  return {
    base: "/",
    root: resolve(PKG_DIR, "app"),
    publicDir: resolve(PKG_DIR, "public"),
    plugins: [
      // Virtual module plugin — no ordering constraint needed since virtual
      // module IDs (virtual:lark-docs/*) are never intercepted by
      // larkMvcPlugin7 or Vite's built-in HTML handler.
      themeDualMode() as PluginOption,
      ...larkDocsPlugin({
        config: larkDocsConfig,
        vdom: false,
        debug: true,
      }),
      docsGuardPlugin(),
      tailwindcss() as PluginOption,
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.svg",
          "favicon.ico",
          "apple-touch-icon-180x180.png",
        ],
        manifest: {
          name: "Lark Docs",
          short_name: "lark-docs",
          description: "Lark Docs",
          theme_color: "#ecfdf5",
          background_color: "#ecfdf5",
          display: "standalone",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "pwa-64x64.png",
              sizes: "64x64",
              type: "image/png",
            },
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          // Pure-vendor lazy chunks (mermaid and its diagram sub-bundles,
          // ~3.4 MB) live under assets/lazy/ (see chunkFileNames below) and
          // are fetched on demand + runtime-cached instead of precached.
          globIgnores: ["**/assets/lazy/**"],
          // The Storybook and Slidev sites are copied into dist/storybook and
          // dist/slidev AFTER this build (see main.sh), so they are never
          // precached — but the generated service worker has scope "/" and a
          // navigateFallback to this SPA's index.html, which would answer their
          // navigations with the docs shell for anyone who already has the worker
          // installed. `(\/|$)` matters: without it /storybook (no trailing
          // slash) still gets hijacked.
          navigateFallbackDenylist: [/^\/(storybook|slidev)(\/|$)/],
          runtimeCaching: [
            {
              // Hash-named vendor chunks excluded from the precache
              // (assets/lazy/) — immutable, so CacheFirst is safe.
              urlPattern: /\/assets\/lazy\/.*\.js$/,
              handler: "CacheFirst",
              options: {
                cacheName: "lazy-vendor-cache",
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }) as PluginOption,
    ],
    resolve: {
      alias: {
        "@lark-docs/generated": resolve(PKG_DIR, ".lark-docs/generated"),
        "@lark.js/docs": resolve(PKG_DIR, "src"),
        "@lark.js/mvc": resolve(PKG_DIR, "../lark-mvc/dist"),
      },
    },
    build: {
      outDir: resolve(PKG_DIR, "dist-docs"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Pure-vendor chunks (every module from node_modules or a bundler
          // virtual module) are only reachable through dynamic imports —
          // today that is mermaid and its diagram sub-bundles. Route them
          // to assets/lazy/ so the PWA precache can exclude them; content
          // and app chunks keep the default location and stay precached.
          chunkFileNames(chunk) {
            const vendorOnly =
              chunk.moduleIds.length > 0 &&
              chunk.moduleIds.every(
                (id) => id.includes("node_modules") || id.startsWith("\0"),
              );
            return vendorOnly
              ? "assets/lazy/[name]-[hash].js"
              : "assets/[name]-[hash].js";
          },
        },
      },
    },
  };
}
