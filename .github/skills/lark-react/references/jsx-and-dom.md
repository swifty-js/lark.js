# JSX Runtimes and DOM Semantics

## Runtimes

| Function                                    | Module                           | Used by                                                                                                      |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `jsx(type, props, key?)` / `jsxs` (=jsx)    | `@lark.js/react/jsx-runtime`     | Compiled automatic-runtime JSX (`jsxImportSource`)                                                           |
| `jsxDEV(type, props, key, ...devMeta)`      | `@lark.js/react/jsx-dev-runtime` | Dev transform; delegates to `jsx`, ignores source metadata                                                   |
| `createElement(type, config?, ...children)` | `@lark.js/react`                 | Classic/manual element creation (extracts `key` from config, merges variadic children into `props.children`) |

All produce the same descriptor:

```ts
interface VNode {
  readonly type: string | ComponentType | symbol; // symbol = Fragment/Text
  readonly key: string | null; // coerced via String(key)
  readonly props: Props;
  // instance fields (renderer-owned): dom, children, hooks, refCleanup
}
```

`jsx` reuses the compiler-owned props object **verbatim** — it may be frozen
and is never copied or mutated (`children` stays inside props; `key` arrives
as the third argument). `Fragment` is `Symbol.for("lark.react.fragment")`,
identical across ESM/CJS copies.

## The type layer (derived from @types/react)

`@types/react` is a **types-only dependency** — the runtime never imports
`"react"`. `lib/jsx-runtime.ts` exports a `declare namespace JSX` whose
`IntrinsicElements` maps React's per-tag props through two utilities:

```ts
// synthetic handler ⇒ native handler (probed via nativeEvent/currentTarget)
type NativeHandler<H> = H extends (event: infer E) => void
  ? [E] extends [{ nativeEvent: infer N; currentTarget: infer C }]
    ? (event: N & { currentTarget: C }) => void
    : H
  : H;

type TagProps<P, T> = {
  [K in keyof P as K extends "ref" ? never : K]: K extends "children"
    ? Children
    : NativeHandler<P[K]>;
} & { ref?: Ref<T> | undefined };
```

Consequences worth knowing when writing typed code:

- `onClick` on a `<button>` is
  `(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) => void`
  — the NATIVE event, with a precise `currentTarget`.
- `children` is this framework's `Children` union (React's `ReactNode` would
  reject `VNode` because `type` includes symbols).
- `ref` accepts `Ref<T> = { current: T | null } | ((el: T | null) => void | (() => void)) | null`.
- Everything else — per-tag attributes, `className`, `style: CSSProperties`,
  `aria-*`, `data-*`, all svg/mathml tags — comes from `@types/react`
  unchanged. Unknown props and unknown lowercase tags are type errors.
- `style` accepts a **string** at runtime but the TYPE is `CSSProperties`
  only; string styles need `createElement` or a cast.
- `key?: string | number | bigint | null` is valid on every tag/component
  via `IntrinsicAttributes`.

## DOM prop handling (what updateProps does)

Reserved props never touch the DOM: `children`, `key`, `ref`,
`dangerouslySetInnerHTML`.

| Prop shape               | Behavior                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `className`, `htmlFor`   | Attribute alias → `class`, `for` (removed when the prop disappears)                                                                                                                          |
| `onXxx` (on + uppercase) | `addEventListener(xxx.toLowerCase(), fn)`; identity change swaps the listener; removal detaches. NATIVE events — `onChange` = native change event                                            |
| `style` object           | Per-key diff; removed keys cleared; numbers get `px` unless the property is unitless (preact's regex: opacity, zIndex, flex, order, lineHeight...); `--custom-props` via `style.setProperty` |
| `style` string           | `cssText` assignment (runtime-only path, see type note above)                                                                                                                                |
| Property-backed names    | Non-SVG elements: `name in dom` → written as a PROPERTY (`value`, `checked`, `disabled`, ...; `null`/`undefined` write `""`)                                                                 |
| Everything else          | `setAttribute` (`null`/`undefined`/`false` remove; `true` writes `""`)                                                                                                                       |

Unchanged values are skipped via `Object.is`; stale props absent from the new
set are removed first.

**Controlled inputs**: `value`/`checked` are written as properties on render,
but there is NO React-style forced re-sync — user typing is not reverted
until a re-render writes the prop again. For strict controlled behavior,
re-render on the input's native event (`onInput`).

## dangerouslySetInnerHTML

```tsx
<div dangerouslySetInnerHTML={{ __html: trustedHtml }} />
```

- Writes `innerHTML` when `__html` changes; removing the prop clears it.
- Children reconciliation is SKIPPED for that element (existing child
  instances are unmounted so their cleanups/refs still run).
- The value is parsed as markup — the caller must sanitize untrusted input.
  For plain text, render strings (they become text nodes).

## SVG

- `<svg>` and its descendants are created with
  `createElementNS("http://www.w3.org/2000/svg", tag)`; a `<foreignObject>`
  escapes children back to HTML.
- SVG elements take the attribute-only path (their reflected props like
  `className`/`width` are read-only `SVGAnimated*` objects); `className`
  still aliases to the `class` attribute. Events and `style` work the same
  as HTML.

## Refs (host elements)

- Attached AFTER the element is inserted, children before parents, and
  before effects flush — `useEffect` can read `ref.current` on mount.
- Object ref: `.current = element` on attach, `null` on detach.
- Function ref: called with the element; a returned function becomes the
  cleanup (stored on the instance) and runs on detach; without a cleanup the
  ref is called with `null`. When the `ref` PROP identity changes on update,
  the old ref detaches and the new one attaches.
- On unmount, refs detach in the same children-first teardown walk as effect
  cleanups.
