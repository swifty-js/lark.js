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
 * Vite plugin for @lark.js/docs.
 *
 * A single plugin that handles BOTH:
 * 1. .md file compilation (frontmatter, markdown-it, Shiki)
 * 2. .html template compilation (lark-mvc template engine)
 *
 * Consumers only need this one plugin — no separate larkMvcPlugin7() required.
 *
 * Usage:
 * ```ts
 * import { larkDocsPlugin } from "@lark.js/docs/vite";
 *
 * export default defineConfig({
 *   // larkDocsPlugin returns an array — spread it or nest it.
 *   plugins: [larkDocsPlugin({ config: docsConfig })],
 * });
 * ```
 */
import fs from "node:fs";
import { isAbsolute, resolve, dirname } from "node:path";
import { z } from "zod";
import type { DocsConfig } from "./types";
import { compileMarkdown } from "./compile-markdown";
import { extractFrontmatter } from "./markdown/frontmatter";
import type { Plugin } from "vite";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import {
  larkMvcPlugin,
  type LarkMvcVitePluginOptions,
} from "@lark.js/mvc/vite";

// Re-export build-time utilities for use in vite.config
// (avoids importing from main entry which pulls in lucide-static SVG ?raw imports)
export { defineConfig } from "./define-config";
export { scanDocsDir } from "./scanner";
export { generateSidebar } from "./sidebar-generator";
export type { DocsConfig, SidebarConfig } from "./types";

export interface LarkDocsVitePluginOptions extends LarkMvcVitePluginOptions {
  /** Full docs config. */
  config: DocsConfig;
}

// Suffix used to mark compiled .md files in the module graph
const MD_SUFFIX = "?lark-docs";

/**
 * Create a Vite plugin array that handles both .md and .html compilation.
 *
 * Returns an array of two plugins:
 * 1. lark-docs: compiles .md files to JS modules
 * 2. lark-template (from @lark.js/mvc): compiles .html templates
 *
 * `vdom` is read from this function's own options (default false) and
 * forwarded to the lark-mvc plugin — `DocsConfig` has no `vdom` field.
 */
export function larkDocsPlugin(options: LarkDocsVitePluginOptions): Plugin[] {
  const { config, debug = false, vdom = false } = options;

  const docsPlugin: Plugin = {
    name: "lark-docs",
    enforce: "pre",

    resolveId(source: string, importer?: string) {
      // Strip query params (Vite 8 may add ?import, ?url, etc.)
      const cleanSource = source.split("?")[0];
      if (!cleanSource.endsWith(".md")) return null;
      // Don't intercept markdown from node_modules — third-party packages
      // may import their own README/changelog and those should not be
      // compiled through the lark-docs pipeline.
      if (cleanSource.includes("node_modules")) return null;
      // Resolve to an absolute path so Vite can locate the file regardless
      // of the importer location. Returning a relative id here caused Vite
      // to normalize it against an unexpected root, producing
      // "/docs/index.md" (ENOENT).
      const abs = isAbsolute(cleanSource)
        ? cleanSource
        : importer
          ? resolve(dirname(importer), cleanSource)
          : resolve(process.cwd(), cleanSource);
      // Strip Vite's /@fs prefix so we return a real filesystem path.
      // Vite will re-add /@fs if the file is outside root. Without this,
      // returning "/@fs/.../docs/index.md?lark-docs" confused downstream
      // id normalization.
      const real = abs.startsWith("/@fs") ? abs.slice("/@fs".length) : abs;
      if (debug) {
        console.log(
          `[@lark.js/docs] resolveId: ${source} -> ${real}${MD_SUFFIX} (importer=${importer ?? "none"})`,
        );
      }
      return real + MD_SUFFIX;
    },

    async load(id: string) {
      // Vite may add extra query params (e.g. ?import&lark-docs),
      // so check if lark-docs is in the query, not just endsWith.
      const qIdx = id.indexOf("?");
      const query = qIdx >= 0 ? id.slice(qIdx + 1) : "";
      if (!query.split("&").includes("lark-docs")) return null;

      // Extract file path: strip query params
      let filePath = qIdx >= 0 ? id.slice(0, qIdx) : id;

      // Strip Vite's @fs prefix (used for files outside the root)
      if (filePath.startsWith("/@fs")) {
        filePath = filePath.slice("/@fs".length); // "/@fs/path" → "/path"
      }

      if (debug) {
        console.log(`[@lark.js/docs] load: id=${id} filePath=${filePath}`);
      }

      const source = fs.readFileSync(filePath, "utf-8");

      return await compileMarkdown(source, {
        config,
        filePath,
      });
    },
  };

  const baseSyncPlugin: Plugin = {
    name: "lark-docs:base-sync",
    config(userConfig) {
      if (userConfig.base === undefined && config.baseUrl) {
        return { base: config.baseUrl };
      }
      return null;
    },
  };

  // GitHub Pages (and similar static hosts) serve 404.html for unknown
  // paths. Shipping a copy of index.html restores deep links / refreshes
  // for the history-based SPA router.
  let resolvedOutDir = "";
  const spaFallbackPlugin: Plugin = {
    name: "lark-docs:spa-fallback",
    apply: "build",
    configResolved(resolvedConfig) {
      resolvedOutDir = resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
      );
    },
    closeBundle() {
      const indexHtml = resolve(resolvedOutDir, "index.html");
      const fallbackHtml = resolve(resolvedOutDir, "404.html");
      if (fs.existsSync(indexHtml) && !fs.existsSync(fallbackHtml)) {
        fs.copyFileSync(indexHtml, fallbackHtml);
        if (debug) {
          console.log("[@lark.js/docs] emitted 404.html SPA fallback");
        }
      }
    },
  };

  // The lark-mvc template plugin handles .html template compilation.
  // We integrate it internally so consumers don't need to configure it separately.
  const plugin = larkMvcPlugin({ debug, vdom });

  return [docsPlugin, baseSyncPlugin, spaFallbackPlugin, plugin as Plugin];
}

function isProtectedMarkdown(id: string): string | null {
  if (!id.includes(MD_SUFFIX)) return null;
  const filePath = id.split("?")[0].replace(/^\/@fs/, "");
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  // Use the same YAML parse as the scanner so every `protected` spelling
  // YAML treats as true (True, yes, on) is caught — a regex-only check
  // would let such pages ship unencrypted while the scanner still marks
  // them protected.
  const { data } = extractFrontmatter(raw);
  return data["protected"] === true ? filePath : null;
}

/**
 * Build-time page encryption for pages marked `protected: true` in their
 * frontmatter. Requires the DOCS_PASSWORD environment variable; without it
 * the plugin degrades to a warn-only no-op so protected pages are never
 * silently published unencrypted.
 *
 * Pair with `createContentGuard()` on the client to prompt for the
 * password and decrypt at view time.
 */
export function docsGuardPlugin(): Plugin {
  const password = process.env["DOCS_PASSWORD"];
  if (!password) {
    return {
      name: "docs-guard",
      enforce: "post",
      transform(_code, id) {
        const filePath = isProtectedMarkdown(id);
        if (filePath) {
          console.warn(
            `[@lark.js/docs] ${filePath} has "protected: true" but ` +
              `DOCS_PASSWORD is not set — the page will be published UNENCRYPTED.`,
          );
        }
        return null;
      },
    };
  }

  return {
    name: "docs-guard",
    enforce: "post",

    transform(code, id) {
      const filePath = isProtectedMarkdown(id);
      if (!filePath) return null;

      const htmlMatch = code.match(
        /export const contentHtml = ("(?:[^"\\]|\\.)*");?\s*$/m,
      );
      if (!htmlMatch) {
        this.warn(
          `[@lark.js/docs] could not locate contentHtml in ${filePath} — ` +
            `page left UNENCRYPTED.`,
        );
        return null;
      }

      // The regex above matched a JSON string literal, but validate rather
      // than assert — encrypting garbage would brick the page silently.
      const html = z.string().parse(JSON.parse(htmlMatch[1]));

      // pageData ships in plaintext and feeds the search index; the
      // body-derived fields (excerpt/description/headings) are stripped so
      // protected content cannot be read through search results. Headings
      // are encrypted alongside the HTML so the Toc can be restored after
      // unlock. The title stays — it is already visible in the sidebar.
      const pdMatch = code.match(/export const pageData = (\{[\s\S]*?\n\});/);
      let pd: Record<string, unknown> | null = null;
      if (pdMatch) {
        try {
          pd = z.record(z.string(), z.unknown()).parse(JSON.parse(pdMatch[1]));
        } catch {
          this.warn(
            `[@lark.js/docs] could not sanitize pageData in ${filePath} — protected excerpt/headings may leak into the search index.`,
          );
        }
      }

      const plaintext = JSON.stringify({
        html,
        headings: Array.isArray(pd?.["headings"]) ? pd["headings"] : [],
      });

      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const key = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf-8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const payload = JSON.stringify({
        encrypted: encrypted.toString("base64"),
        authTag: authTag.toString("base64"),
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
      });

      let out = code.replace(
        htmlMatch[0],
        `export const contentHtml = ${JSON.stringify(payload)};`,
      );

      if (pd && pdMatch) {
        pd["description"] = undefined;
        pd["excerpt"] = "";
        pd["headings"] = [];
        out = out.replace(
          pdMatch[0],
          `export const pageData = ${JSON.stringify(pd, null, 2)};`,
        );
      }

      return { code: out, map: null };
    },
  };
}
