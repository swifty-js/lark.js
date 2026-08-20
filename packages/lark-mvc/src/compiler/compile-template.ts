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

import {
  convertArtSyntax,
  processViewEvents,
  processViewBindings,
  protectComments,
  restoreComments,
} from "./template-syntax";
import type { CompileOptions } from "@/types";
import { extractGlobalVars } from "./extract-global-vars";

// ─── Phase 3: Compile to template function ───────────────────────────────

/**
 * Compile internal `<% %>` syntax to a JS template function source string.
 *
 * Walks the source with a regex matcher, converting each `<%operate content%>`
 * block into the corresponding JS expression:
 * - `<%=expr%>` / `<%:expr%>` → `__lark_enc_html__(expr)` (HTML-escaped output)
 * - `<%!expr%>` → `__lark_str_safe__(expr)` (raw output)
 * - `<%@expr%>` → `__lark_ref_fn__(__lark_ref_alt__, expr)` (reference token)
 * - `<%code%>` → raw JS statement (if/for/else blocks)
 *
 * Plain text between blocks is escaped and appended to `__lark_out__`.
 *
 *
 * @param source - The `<% %>`-syntax source (from `convertArtSyntax`)
 * @returns An arrow function source string
 */
function compileToFunction(source: string): string {
  const matcher = /<%([@=!:])?([\s\S]*?)%>|$/g;
  let index = 0;
  let funcSource = `__lark_out__+='`;

  // Escape regexp for string literals
  const escapeSlashRegExp = /\\|'/g;
  const escapeBreakReturnRegExp = /\r|\n/g;

  source.replace(matcher, (match, operate, content, offset) => {
    // Escape plain text between template expressions
    funcSource += source
      .substring(index, offset)
      .replace(escapeSlashRegExp, "\\$&")
      .replace(escapeBreakReturnRegExp, "\\n");
    index = offset + match.length;

    // Dispatch on the operator character of the <%op content%> block
    if (operate === "@") {
      funcSource += `'+__lark_ref_fn__(__lark_ref_alt__,${content})+'`;
    } else if (operate === "=" || operate === ":") {
      // : (binding) is treated the same as = (escaped output) for rendering
      funcSource += `'+__lark_enc_html__(${content})+'`;
    } else if (operate === "!") {
      funcSource += `'+__lark_str_safe__(${content})+'`;
    } else if (content) {
      funcSource += `';`;
      // Clean up trailing +''; → ;
      if (funcSource.endsWith(`+'';`)) {
        funcSource = funcSource.substring(0, funcSource.length - 4) + ";";
      }
      funcSource += `${content};__lark_out__+='`;
    }
    return match;
  });

  funcSource += `';`;

  // ─── Post-processing cleanup ──────────────────────────────────────

  // Remove empty concatenations: __lark_out__=''; → (removed)
  funcSource = funcSource.replace(/__lark_out__\+='';/g, "");
  // Fix empty string concatenation: __lark_out__=''+ → __lark_out__+=
  funcSource = funcSource.replace(/__lark_out__\+=''\+/g, "__lark_out__+=");

  // ─── View ID injection: \x1f → '+__lark_view_id__+' ────────────────

  // Use String.fromCharCode to safely handle \x1f control character
  const viewIdRegExp = new RegExp(String.fromCharCode(0x1f), "g");
  funcSource = funcSource.replace(viewIdRegExp, `'+__lark_view_id__+'`);

  // ─── Build complete function source ───────────────────────────────
  //
  // Runtime helpers (`__lark_enc_html__`, `__lark_str_safe__`,
  // `__lark_ref_fn__`) come in as parameters supplied from
  // `@lark.js/mvc/runtime` — see `compileTemplate()`.
  // The only remaining setup is the `__lark_ref_alt__` fallback for
  // templates invoked without refData.
  const refFallback = "if(!__lark_ref_alt__)__lark_ref_alt__=__lark_data__;";
  const fullSource = `${refFallback}let __lark_out__='';{{__lark_vars__}};${funcSource}return __lark_out__`;

  // Wrap in arrow function signature — 6 params (data, viewId, refAlt, encHtml, strSafe, refFn)
  return `(__lark_data__,__lark_view_id__,__lark_ref_alt__,__lark_enc_html__,__lark_str_safe__,__lark_ref_fn__)=>{${fullSource}}`;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Compile an HTML template string into a JS module string.
 * This is the main entry point for the Vite / Webpack / Rspack integrations.
 *
 * The output is an ES module **source string** whose default export is a
 * named function `__lark_template__` with the signature:
 *   (data, viewId, refData) => string
 *
 * Internally the wrapper calls the compiled inner arrow function with the
 * runtime helpers appended — 6 args
 * (__lark_data__,__lark_view_id__,__lark_ref_alt__,__lark_enc_html__,__lark_str_safe__,__lark_ref_fn__).
 *
 * @param source - The raw HTML template content
 * @param options - Compilation options
 * @returns ES module source code exporting the compiled template function
 */
export async function compileTemplate(
  source: string,
  options: CompileOptions = {},
): Promise<string> {
  const globalVars = options.globalVars ?? (await extractGlobalVars(source));

  // Phase 1: Protect comments
  const { protectedSource, comments } = protectComments(source);

  // Phase 2: Convert {{ }} art-template syntax to <% %> internal syntax
  // (Before @event processing, so {{=variable}} inside @event params
  // is already converted to <%=variable%>
  const converted = convertArtSyntax(protectedSource);

  // Phase 3: Process @event attributes after art conversion
  const viewEventProcessed = processViewEvents(converted);

  // Phase 3b: Process *prop and @event bindings on v-lark elements
  const viewBindingsProcessed = processViewBindings(viewEventProcessed);

  // Restore comments
  const finalSource = restoreComments(viewBindingsProcessed, comments);

  // Build the variable declarations string from globalVars
  const varDeclarations = globalVars.map((key) => `let ${key}=__lark_data__.${key};`).join("");

  const funcBody = compileToFunction(finalSource);
  const funcWithVars = funcBody.replace("{{__lark_vars__}}", () => varDeclarations);

  // Runtime helpers (`encHtml`, `strSafe`, `refFn`) are imported from
  // `@lark.js/mvc/runtime` rather than inlined into every compiled template —
  // saves bytes per `.html` module in the bundle.
  //
  // The default export is a named function (__lark_template__) so that the
  // auto-injected HMR snippet (see hmr-inject.ts) can reference it by name.
  return `import { encHtml as __lark_enc_html__, strSafe as __lark_str_safe__, refFn as __lark_ref_fn__ } from "@lark.js/mvc/runtime";
function __lark_template__(data, viewId, refData) {
  let __lark_data__ = data || {},
      __lark_view_id__ = viewId || '';
  return (${funcWithVars})(__lark_data__, __lark_view_id__, refData,
    __lark_enc_html__, __lark_str_safe__, __lark_ref_fn__
  );
}
export default __lark_template__;`;
}
