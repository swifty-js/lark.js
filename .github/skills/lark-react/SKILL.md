---
name: lark-react
description: >-
  Authoritative reference for @lark.js/react (v0.0.1), the lightweight Mini
  React implementation located at packages/react — FUNCTION COMPONENTS ONLY
  (no classes, no Fiber, no SSR, no Suspense/portals/context), whole-root
  synchronous re-renders driven by a two-pass keyed diff, call-order hooks
  (useState, useEffect, useMemo, useCallback, useRef), a @types/react-derived
  JSX type layer where event handlers receive NATIVE DOM events (not
  synthetic), React-19-style ref cleanups, SVG namespacing,
  dangerouslySetInnerHTML, and state-preserving HMR via the larkReactPlugin
  vite plugin + hotSwapByComponent alias chain. Use this skill whenever
  writing, reviewing, refactoring, or debugging code that imports
  "@lark.js/react" or its /jsx-runtime, /jsx-dev-runtime, or /vite entries,
  configuring its build/HMR/vitest setup, editing anything under
  packages/react (lib/ or tests/), or answering how this mini react works —
  even if the user just says "react" while working inside the lark.js repo.
---

# Lark React (`@lark.js/react`)

A Mini React: the smallest useful subset of React's programming model —
elements, a keyed reconciler, five hooks, native-DOM events — with no legacy
baggage. Source: `packages/react` (v0.0.1, ESM+CJS dual build via tsup, one
types-only dependency: `@types/react`; zero runtime dependencies).

Core philosophy: **function components only** — no classes, no Fiber, no
interruptible scheduling, no SSR, no synthetic event system, no context, no
portals, no memo/lazy/Suspense, no error boundaries (errors bubble). Every
update re-renders the WHOLE root tree synchronously; render (re-running
components) + reconcile (the keyed diff) converge actual DOM mutations onto
the changed nodes. JSX types are **derived from `@types/react`** with two
adaptations: handlers get NATIVE events, and `ref` takes this framework's
`Ref<T>` (callback refs may return a cleanup, React 19 style). HMR preserves
hook state through an alias chain — no `import.meta.hot` boilerplate.

## Package entry points

| Import                           | Provides                                                                                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lark.js/react`                 | `render`, `createRoot`, `createElement`, `Fragment`, `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `hotSwapByComponent`, types (`VNode`, `ComponentType`, `Children`, `Props`, `Key`, `Ref`, `SetStateAction`, `Dispatch`, `EffectCallback`, `DepList`, `VNodeType`) |
| `@lark.js/react/jsx-runtime`     | Automatic runtime: `jsx`, `jsxs`, `Fragment`, `Ref` type, the exported `JSX` namespace (referenced by `jsxImportSource`, not imported by hand)                                                                                                                                      |
| `@lark.js/react/jsx-dev-runtime` | `jsxDEV` dev runtime (re-exports everything from jsx-runtime)                                                                                                                                                                                                                       |
| `@lark.js/react/vite`            | `larkReactPlugin()` — esbuild automatic-JSX defaults + auto-injected component HMR; also exports `injectComponentHmrSnippet` for testing                                                                                                                                            |

tsconfig for consumers: `"jsx": "react-jsx"`, `"jsxImportSource": "@lark.js/react"`.
Under Vite the plugin sets the compile-time equivalents automatically; the
tsconfig entries are still needed for editor/`tsc` type checking.

## The 60-second mental model

```
render(<App/>, container)          // or createRoot(container).render(<App/>)
        │
one Root per container (WeakMap) — root.element is the boot descriptor
        │
renderRoot: SYNCHRONOUS, non-interruptible
   diffChildren (two-pass keyed diff, right-to-left commit)
        │     components/Fragments are HOSTLESS — children splice into the
        │     nearest host parent; instances carry {dom, children, hooks}
   commit  ── per-node listeners (native events), props, refs (children first)
        │
   flushEffects ── ALL changed effects: cleanup pass then create pass,
        │          children before parents, SYNCHRONOUS after commit
        │          (≈ useLayoutEffect timing; there is no async effect queue)
setState ──> marks the root dirty; queueMicrotask batches every setState from
             the same tick into ONE whole-root re-render
```

A **component** is `function MyComp(props: P) { return <div/>; }` used as a
JSX tag. The body re-runs on every root render; state lives in call-order
hook slots on the instance. Instances are matched across renders by
`type` identity (+ `key` among siblings) — under HMR, identity resolves
through the hot-swap alias chain.

## Quick start (canonical shape)

```tsx
// src/app.tsx — DEFAULT export ⇒ state-preserving HMR is auto-injected
import { useEffect, useRef, useState } from "@lark.js/react";

export default function App() {
  const [count, setCount] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    document.title = `count ${count}`;
  }, [count]);
  return (
    <div ref={box} className="app" style={{ padding: 16 }}>
      <button onClick={() => setCount((n) => n + 1)}>+1</button>
      <output>{count}</output>
    </div>
  );
}
```

```tsx
// src/main.tsx
import { createRoot } from "@lark.js/react";
import App from "./app";

createRoot(document.getElementById("root")!).render(<App />);
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { larkReactPlugin } from "@lark.js/react/vite";

export default defineConfig({ plugins: [larkReactPlugin()] });
```

## Critical rules (violating these causes the classic bugs)

1. **Rules of hooks** — bodies re-run every root render, so hooks must run
   unconditionally, in the same order, at the top level. Slots are matched
   by call index; a tag mismatch at an index (an HMR edit reordered hooks)
   destructively resets that slot, and trailing slots the new body no longer
   reaches are cleaned up and dropped.
2. **setState is batched and asynchronous** — it marks the root dirty and a
   microtask re-renders once. The DOM is NOT updated when setState returns;
   in tests `await Promise.resolve()` observes the committed DOM (one await
   per cascade wave). `setState` identity is stable; the eager
   `Object.is` bailout skips renders when the value did not change.
   `setState(fn)` treats a FUNCTION argument as an updater and CALLS it with
   the previous state — to store a function as state (e.g. a store action
   from an external-store hook), wrap it: `setState(() => fn)`. Update loops
   that never settle throw `Maximum update depth exceeded` after 50 waves.
3. **Every update re-renders the whole root** — there is no memo/bailout
   pruning. Keep bodies cheap; the diff converges DOM writes, but component
   code itself always re-executes. Handlers are re-created per render (fine
   — listeners are diffed by identity and swapped).
4. **Event handlers receive NATIVE DOM events** — `onClick` is
   `addEventListener("click", fn)` with the real `MouseEvent`. There is no
   synthetic layer: `onChange` fires on the native **change** event (React's
   per-keystroke behavior needs `onInput`). No pooling, no
   `nativeEvent`/`persist()`.
5. **Effects are synchronous after commit** (layout timing). `useEffect`
   with no deps runs after EVERY render; `[]` runs once; deps compare with
   `Object.is`. Order: all due cleanups (children→parents), then all creates
   (children→parents). Unmount runs cleanups children-first.
6. **`key` is a sibling-scoped compare key** (coerced to string; never a DOM
   id). Keyless siblings match by index. On component tags a stable key
   preserves the INSTANCE (hooks) across reorders. Same key + different type
   = unmount + create.
7. **`ref` is renderer-managed on host elements only** — object refs get
   `.current`, function refs run on attach and may return a cleanup (run on
   detach; otherwise the fn is called with `null`). On a component tag `ref`
   is an ordinary prop the component must forward itself.
8. **Strings are text everywhere**; `dangerouslySetInnerHTML={{ __html }}`
   is the only trusted-HTML path (it skips children reconciliation — never
   combine with children; sanitize untrusted input).
9. **HMR hot-swaps DEFAULT-exported components** in `.tsx`/`.jsx` files —
   `useState`/`useRef` state survives. Non-default or nested-in-module
   components remount with fresh state on edit. Manual API:
   `hotSwapByComponent(oldFn, newFn)`.
10. **Out of scope by design** — no context/useReducer/portals/Suspense/
    SSR/class components. Code needing those belongs on real React; this
    package is deliberately minimal.

## Reference files — read on demand

| File                                                                     | Read when working on                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [references/components-and-hooks.md](references/components-and-hooks.md) | Components (props/children/key/callbacks), the five hooks in depth, render/createRoot lifecycle, update batching, effect ordering, unmount teardown, testing patterns                    |
| [references/jsx-and-dom.md](references/jsx-and-dom.md)                   | JSX runtimes (`jsx`/`jsxs`/`jsxDEV`/`createElement`), the @types/react-derived type layer, DOM prop handling tables (aliases, events, style/px, controlled props, SVG, dSIH, refs)       |
| [references/hmr-and-build.md](references/hmr-and-build.md)               | `larkReactPlugin` usage and injection details, `hotSwapByComponent` semantics and limits, package exports, tsup build, vitest/tsconfig setup                                             |
| [references/rendering-internals.md](references/rendering-internals.md)   | renderRoot pipeline, two-pass keyed diff (watermark, right-to-left commit, anchors), hostless components, instance carry-over, HMR canonical identity — read when debugging renders/perf |
