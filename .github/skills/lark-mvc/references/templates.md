# JSX Template System

Source of truth: `src/jsx/template.ts`, `src/jsx/serialize.ts`,
`src/jsx/vnode.ts`, `src/jsx-runtime.ts`.

There is **no template compiler and no `.html` files** — templates are
JSX/TSX compiled by the standard automatic runtime
(`jsxImportSource: "@lark.js/mvc"`). `jsxTemplate(renderFn)` adapts a
`() => JSXNode` function into the framework's `ViewTemplate`
(`(viewId, refData) => string`).

```tsx
import { defineView, jsxTemplate, raw, signal, computed } from "@lark.js/mvc";

export default defineView(() => {
  const user = signal({ isAdmin: false });
  const items = signal<{ id: number; name: string }[]>([]);
  const total = computed(() => items.value.length);

  const template = jsxTemplate(() => (
    <>
      {user.value.isAdmin ? <div class="admin">Admin</div> : <div>Guest</div>}
      <ul>
        {items.value.map((item) => (
          <li key={`item-${item.id}`}>{item.name}</li>
        ))}
      </ul>
      <p>{total.value} items</p>
    </>
  ));
  return { template };
});
```

The render function takes **no arguments** — it reads reactive data via
closures (local signals, `params`, `State.get(key)`, `store.getState()`,
`Router.parse()`). It runs inside the view's render effect, so every signal
read subscribes the view. Templates without handlers/ctx can live at module
level; templates capturing setup closures live inside setup.

## Render pipeline (per pass)

```
renderFn() → VNode tree (plain jsx() calls)
  → serialize(vnode, { viewId, refData })
      escape text/attrs, unwrap Signals, encode @event attributes,
      tokenize object/function values via refFn into refData
  → stale refData tokens swept; inline handlers wired (__jsxN keys)
  → HTML string → real-DOM keyed diff
```

## Output semantics

| JSX                      | Behavior                                                            |
| ------------------------ | ------------------------------------------------------------------- |
| `{expr}` (string/number) | HTML-escaped text (`0` renders; `boolean/null/undefined` render "") |
| `{sig}` (Signal)         | Auto-unwrapped to `sig.value` — a tracked read                      |
| `{raw(html)}`            | Trusted raw HTML, no escaping — never pass untrusted input          |
| `{cond && <div/>}`       | Conditional rendering (falsy values dropped)                        |
| `{list.map(...)}`        | List rendering (arrays flattened)                                   |
| `<>...</>` (Fragment)    | Multiple roots without a wrapper element                            |
| `<Row item={x} />`       | Functional component — pure template partial, invoked at render     |
| `<MyView prop={x} />`    | View component (`defineView` result) — mounted as a child frame     |

## Attribute semantics

| Attribute             | Behavior                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `class` / `className` | String, array (falsy entries dropped), or `{ name: boolean }` map        |
| `style`               | String, or camelCase object (kebab-cased; no implicit `px`)              |
| `id` / `key`          | Keyed-diff compare key; `key` emits as `id` when no explicit `id` is set |
| `disabled={true}`     | Boolean attribute → `disabled=""`; `false`/nullish omit the attribute    |
| `title={sig}`         | Signal attribute values auto-unwrap (tracked read)                       |
| `data-x={object}`     | Object/array/function values become live refData tokens                  |
| `onClick={fn}`        | Delegated event (see views.md) — inline functions only                   |

Component props are the exception to Signal unwrapping: a Signal passed as a
component prop stays wrapped so the child can subscribe directly.

Give loop items a stable `key` (or `id`) for keyed reordering instead of
in-place rewrites — ids are document-global, keep them unique.

## Functional components (template partials)

Props in, JSX out — invoked during serialization, no lifecycle, no frame.
Use `defineView` components for stateful composition.

```tsx
import type { JSXNode } from "@lark.js/mvc";

function Badge(props: { label: string; children?: JSXNode }) {
  return (
    <span class="badge">
      {props.label}: {props.children}
    </span>
  );
}
```

`key` on a functional component forwards to its (keyless) single root.

## Security / correctness notes

- All text and attribute values are HTML-escaped; `raw()` is the only escape
  hatch — treat its input as trusted.
- Native inline handlers (`onclick="..."` lowercase, or string values on
  `onClick`) are rejected — they would execute attribute text as JS.
- Attribute names are validated (`/^[^\s"'>/=\\]+$/`) — dynamic prop spreads
  cannot inject attributes.
- Writing a signal inside the render function is a reactivity cycle
  (`Cycle detected`) — derive with `computed` instead.
