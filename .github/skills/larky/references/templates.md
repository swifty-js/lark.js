# JSX Semantics & the Typed Layer (`@lark.js/larky`)

## Children

| Child value                      | Rendered as                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `string` / `number`              | Text node (ALWAYS escaped — markup in strings stays text)                                                          |
| `boolean` / `null` / `undefined` | Nothing (enables `{cond && <div/>}`)                                                                               |
| Array                            | Flattened in order                                                                                                 |
| VNode (`<div/>`, `<Comp/>`)      | Element / component instance                                                                                       |
| Signal (`{count}` — no `.value`) | Unwrapped with a TRACKED read (detected via `isSignal`/`isRef`) — the enclosing render effect re-renders on change |
| `raw(html)`                      | Trusted HTML block (template-parsed; the ONLY unescaped path)                                                      |
| `<>...</>` (Fragment)            | Children spliced directly (valid at component root)                                                                |

There is NO `dangerouslySetInnerHTML` — the typed layer rejects it; `raw()`
is the explicit, documented trusted-HTML path. Never pass untrusted input.

## Attributes

- `class` / `className` (merged): string | nestable array (falsy dropped) |
  `{ name: truthy }` map → single class string.
- `style`: css text or camelCase object (`backgroundColor`) — kebab-cased,
  `--vars` kept, NO implicit `px`, `null`/`""`/`false` entries dropped.
- Signal-valued attributes (`class={cls}` where `cls = signal("on")`) are
  unwrapped with a tracked read (top level only — not inside arrays/objects).
- Booleans: `true` → `""` attribute, `false` → removed — EXCEPT enumerated
  attrs (`contenteditable`, `draggable`, `spellcheck`, `aria-*`) which
  serialize `"true"`/`"false"`.
- Form state (`value` on input/textarea/select, `checked` on input,
  `selected` on option) syncs as DOM PROPERTIES and re-syncs
  unconditionally per render (user-typing drift is corrected).
- `ref`: callback `(el | null) => void` or `{ current }` cell (from
  `useRef`). Called post-commit; `null` on unmount.
- `key`: vnode-level sibling compare key for the keyed diff — never
  written to the DOM. On component tags it preserves the instance.
- Security guards at runtime: attribute-name injection pattern check,
  native inline handlers (`onclick="..."`) rejected, non-primitive
  attribute values skipped with a dev warning.
- Namespaces: `<svg>`/`<math>` subtrees create namespaced elements;
  `foreignObject` re-enters HTML.

## The typed JSX layer (complete, strict, Preact-v10-ported)

Per-tag `IntrinsicElements` for ALL HTML + SVG + MathML tags — unknown
tags and mistyped attributes are compile errors. Enum-valued attributes
(`<button type>`, `loading`, `referrerpolicy`, `dir`, ...) are literal
unions. WAI-ARIA 1.1 attributes and `role` are fully typed; `data-*` keys
type via a template-literal index signature.

### Key types (import from `@lark.js/larky`)

```ts
import type {
  JSX, // the namespace: JSX.Element, JSX.IntrinsicElements,
  // JSX.HTMLAttributes<T>, JSX.TargetedEvent<...>, ...
  HTMLAttributes, // top-level aliases of the same types
  SVGAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  AnchorHTMLAttributes, // per-tag
  Signalish, // T | Signal<T> — attribute values accept signals
  TargetedEvent,
  TargetedMouseEvent,
  MouseEventHandler, // events
  EventHandler, // EventHandler<E extends TargetedEvent>
  Ref,
  RefObject,
  RefCallback,
  RefValue, // refs
  ClassValue,
  CSSProperties,
  StyleValue,
  AriaRole,
} from "@lark.js/larky";
```

### The `JSX` namespace in user type positions (React 19 style)

```tsx
import type { JSX } from "@lark.js/larky";

interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline";
}
function Badge({ variant, ...props }: BadgeProps): JSX.Element {
  return <span data-slot="badge" data-variant={variant} {...props} />;
}
```

`JSX` is NOT global — it must be imported (like React 19 / Preact). The
namespace mirrors every DOM type (`JSX.HTMLAttributes`,
`JSX.TargetedEvent`, per-tag interfaces, handlers), so shadcn-style
component wrappers port directly.

### Typed events — narrowed `currentTarget`

```tsx
<input
  onInput={(e) => {
    e.currentTarget.value; // string — currentTarget IS HTMLInputElement
  }}
/>
```

Handlers receive `TargetedEvent<TagElement, NativeEvent>` — the native
event with `currentTarget` narrowed to the tag's element type. There are
NO capture variants and NO synthetic event system.

### Custom elements — module augmentation

```ts
import type { HTMLAttributes } from "@lark.js/larky";

declare module "@lark.js/larky/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "my-widget": HTMLAttributes<HTMLElement> & { variant?: string };
    }
  }
}
```

### `JSXInternal` architecture (why the types are shaped this way)

All DOM types live inside `export declare namespace JSXInternal` in
`src/jsx/dom-types.ts`, and the `JSX` namespace references them through
QUALIFIED names (`JSXInternal.IntrinsicElements`). This is REQUIRED for
d.ts bundling correctness: dts flatteners rewrite plain import aliases to
their canonical top-level names, which would collapse
`interface IntrinsicElements extends <alias>` into an invalid
self-reference — an EMPTY interface under `skipLibCheck`, making every tag
"not exist" for consumers. Qualified namespace references survive
flattening verbatim. Top-level aliases
(`export type HTMLAttributes<...> = JSXInternal.HTMLAttributes<...>`) keep
the flat import API. When editing `dom-types.ts`, preserve this structure,
and verify with the consumer-view typecheck: `pnpm typecheck:dist` (maps
`@lark.js/larky` to `./dist` — see build-and-hmr.md).

## Common type-layer pitfalls

- Attribute names are written as they land in the DOM: `for` (not only
  `htmlFor`), `tabindex`/`tabIndex` both accepted, kebab or camel for SVG
  presentation attributes.
- `Signalish<T>` accepts `computed()` values too (`ComputedRef`
  structurally extends `Ref`).
- `interface X extends HTMLAttributes<HTMLDivElement>` works — the
  top-level aliases resolve to object types.
- Inside the `JSX` namespace, bare `Element` means `JSX.Element` (VNode) —
  qualify DOM element types as `globalThis.Element` if augmenting.
