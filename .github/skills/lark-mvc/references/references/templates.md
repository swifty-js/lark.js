# Template Syntax & Compilation

Source of truth: `src/compiler/template-syntax.ts`,
`src/compiler/compile-template.ts`, `src/compiler/compile-to-vdom-function.ts`,
`src/compiler/extract-global-vars.ts`, `src/runtime.ts`.

Templates are plain `.html` files, compiled at build time by the bundler
plugin into an ES module whose default export is a render function
`(data, viewId, refData) => string | VDomNode`. View code imports them:
`import template from "./home.html";`.

## Output operators

| Syntax      | Output                                                                           | Use for                                                                            |
| ----------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `{{=expr}}` | HTML-escaped (`& < > " ' \`` → entities)                                         | All normal text/attribute output                                                   |
| `{{:expr}}` | Same as `=` at render time (two-way-binding marker)                              | Form value binding                                                                 |
| `{{!expr}}` | Raw, unescaped (null-safe string)                                                | Trusted HTML (icons, rendered markdown)                                            |
| `{{@expr}}` | Ref token — stores the live JS value in `refData`, emits a `\x1e`-prefixed token | Passing objects/arrays/functions through DOM attributes (esp. `*prop` to children) |

`null`/`undefined` render as empty string. `{{=}}` inside comments is left
untouched (comments are protected during compilation).

## Control flow

```html
{{if user.isAdmin}}
<div>admin</div>
{{else if user.isEditor}}
<div>editor</div>
{{else}}
<div>user</div>
{{/if}}
```

- Shorthand `{{if(cond)}}` and `{{for(init;test;step)}}` are accepted.
- Blocks are validated at compile time: unclosed/mismatched blocks throw with
  the opening line number.
- Control flow works **inside attribute values** too (compiled to an IIFE in
  VDOM mode): `class="base {{if active}}on{{/if}}"`.

## Loops

```html
{{forOf items as item}} ... {{/forOf}} {{forOf items as item idx}} ...
{{/forOf}} {{forOf items as item idx last first}}
<!-- boolean helpers -->
<div class="{{if first}}first{{/if}} {{if last}}last{{/if}}">
  {{=item.name}}
</div>
{{/forOf}} {{forOf entries as {key, value} idx}} ... {{/forOf}}
<!-- destructuring -->

{{forIn config as val key}}
<div>{{=key}} = {{=val}}</div>
{{/forIn}} {{for(let i = 0; i < count; i++)}}<span>{{=i}}</span>{{/for}}
```

The `as` keyword is mandatory for `forOf`/`forIn` — `{{forOf list item}}`
throws a compile error.

## Variable declaration

```html
{{set formatted = new Date(date).toLocaleDateString()}} {{set a = 20, b = 30}}
<p>{{=formatted}} {{=a}}-{{=b}}</p>
```

`{{set}}` vars are locals — the AST-based `extractGlobalVars` excludes them
(and loop vars, function params, builtins like `Math`/`JSON`) from the data
variables destructured out of `updater.data`. Everything else referenced in
the template must exist on `updater.data`.

## Event attributes

```html
<button @click="save()">Save</button>
<button @click="del({id: item.id, mode: 'soft'})">Delete</button>
<!-- → e.params -->
```

- **Parens are required** for view-event handlers. The compiler rewrites the
  attribute to `\x1f\x1ehandler(key=value&...)` — `\x1f` becomes the viewId at
  render time, object-literal args become URL-style params delivered as
  `e.params` (values are stringified).
- Each template attribute binds exactly **one** event name (`@click`,
  `@change`, ...). Multi-event (`"h<click,mousedown>"`) and modifier
  (`"h<click><ctrl>"`) forms are declared on the **events-map key** in the
  view's `.ts` file, not in the template attribute (the compiler's attribute
  regex only matches `@\w+`).
- Paren-less `@event="handlerName"` is only meaningful on a `v-lark` element,
  where it becomes an `e-lark-*` child→parent event binding (see views.md).

## Child-view attributes (on any element)

```html
<div v-lark="components/panel"
     *title="{{=title}}"        <!-- p-lark-title, string -->
     *rows="{{@rows}}"          <!-- p-lark-rows, live reference -->
     @select="onSelect"></div>  <!-- e-lark-select -->
```

## Keyed diff hints

The diff engines key elements by `id` attribute, or by `#` (VDOM-mode-only
key attribute that is stripped from output), or by `v-lark` path. Give loop
items a stable `id="item-{{=item.id}}"` to get keyed reordering instead of
in-place rewrites.

## Compilation pipeline

```
.html source
  → protectComments()      HTML comments → placeholders
  → convertArtSyntax()     {{ }} → internal <% %> (+ block validation, debug line markers)
  → processViewEvents()    @evt="h(args)" → \x1f\x1e prefix + URL params
  → processViewBindings()  *prop → p-lark-*, paren-less @evt → e-lark-*
  → restoreComments()
  → extractGlobalVars()    @babel/parser AST scope analysis (zero-config)
  → string mode: compileToFunction()      → `__lark_out__ += ...` concatenation
    vdom mode:  compileToVDomFunction()   → htmlparser2 walk → vdomCreate() calls
  → ES module: `function __lark_template__(data, viewId, refData) {...}
                export default __lark_template__;`
  → HMR snippet appended by the bundler plugin
```

String-mode modules import `encHtml`/`strSafe`/`refFn` from
`@lark.js/lark-mvc/runtime`; VDOM-mode modules additionally import `vdomCreate`
from `@lark.js/lark-mvc` (which is why `vdomCreate` stays in the public barrel).

## Compiler API (build-time, Node)

```ts
import { compileTemplate, extractGlobalVars } from "@lark.js/lark-mvc/compiler";

await extractGlobalVars(source): string[]      // AST-based; regex fallback on parse failure
await compileTemplate(source, {
  debug?: boolean,        // wrap in try/catch, report template line + expression on render errors
  globalVars?: string[],  // skip auto-extraction
  file?: string,          // path shown in debug error messages
  vdom?: boolean,         // emit VDomNode-building function instead of string
}): string                // ES module source
```

Debug mode (`larkMvcPlugin({ debug: true })`) makes runtime render errors
report the original `{{...}}` expression and line — enable it in dev when
diagnosing "render error" messages.
