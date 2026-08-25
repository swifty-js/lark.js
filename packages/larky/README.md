# @lark.js/larky

A fully React-style, lightweight TypeScript frontend framework built on
`@vue/reactivity` fine-grained signals. No legacy baggage, deliberately
restrained feature set.

- **React-style, function components only** — `(props) => JSX`, rules of
  hooks, keyed diff, callbacks as plain props. No class components.
- **Fine-grained reactivity only** (`@vue/reactivity`) — `useSignal` returns a
  deep `ref`; reads subscribe, writes re-render. **No `useState`, no deps
  arrays, no `useMemo`** — derive with `useComputed`, react with
  `useSignalEffect`; `useEffect(fn)` is mount-only.
- **Automatic batching** — writes never render synchronously; all updates in
  one tick commit in ONE microtask flush. `await nextTick()` /
  `flushSync(fn)`.
- **Hostless reconciler** — components render without wrapper elements
  (comment end-anchors); output DOM is identical to React's. No Fiber, no
  SSR.
- **Built-in Zustand-style store** — anonymous `createStore((set, get) => ...)`
  with per-key subscriptions and `computed` derived slots.
- **Built-in react-router-style router (data mode only)** —
  `createRouter(routes)` factory, `:param`/`*` ranking, `navigate`, async
  blockers, `lazy()` code splitting, `<RouterView/>` outlet, `useUrlState`
  URL-search-param state.
- **State-preserving HMR** for Vite AND webpack — auto-injected, no
  `import.meta.hot` boilerplate; `useSignal`/`useRef` state survives edits.
- **100% TypeScript** — complete typed JSX: strict per-tag intrinsic
  elements (HTML + SVG + MathML, ported from Preact v10), typed events with
  narrowed `currentTarget`, WAI-ARIA attributes, `data-*` template-literal
  keys, and `Signalish<T>` attribute values.

## Quick start

```tsx
// src/main.tsx
import { render, createRouter, RouterView } from "@lark.js/larky";
import Home from "./views/home";
import UserDetail from "./views/user-detail";

const router = createRouter([
  { path: "/", component: Home },
  { path: "/users/:id", component: UserDetail },
  { path: "/admin", lazy: () => import("./views/admin") },
  { path: "*", component: () => <h1>404</h1> },
]);
render(<RouterView router={router} />, document.getElementById("root")!);
```

```tsx
// src/views/user-detail.tsx
import { useSignal, useComputed, useRouter } from "@lark.js/larky";

export default function UserDetail() {
  const router = useRouter();
  const clicks = useSignal(0);
  const doubled = useComputed(() => clicks.value * 2);
  return (
    <div>
      <p>
        user {router.params.value["id"]}, clicks {clicks.value} (x2 = {doubled.value})
      </p>
      <button onClick={() => clicks.value++}>+1</button>
      <button onClick={() => router.navigate("/")}>Home</button>
    </div>
  );
}
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { larkyPlugin } from "@lark.js/larky/vite";

export default defineConfig({ plugins: [larkyPlugin()] });
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@lark.js/larky",
  },
}
```

Webpack: add `new LarkyPlugin()` from `@lark.js/larky/webpack` (the JSX
transform stays with your TS/SWC/babel loader).

## Mental model (60 seconds)

The component body IS the tracked region — it re-runs per render inside the
instance's render effect. Reading a signal, `props.key`,
`store.getState().key`, or `router.params.value` in the body subscribes the
instance to exactly that data. A write enqueues the subscribed instances on
the microtask queue (deduplicated), so N writes in one event handler produce
ONE re-render per instance.

```tsx
const count = useSignal(0); // deep ref — count.value.push(...) also notifies
count.value++; // DOM unchanged here...
await nextTick(); // ...committed now
```

Rules that matter:

1. Rules of hooks (React) — unconditional, same order, top level.
2. `useEffect(fn)` runs once post-commit; `useSignalEffect(fn)` auto-tracks
   and re-runs; NO deps arrays anywhere.
3. Never write a signal that the same body/effect reads — cross-effect write
   cycles throw `Cycle detected` (the flush drains, `nextTick()` rejects).
4. Strings are TEXT everywhere; `raw(html)` is the only trusted-HTML path.
5. Keyed lists need stable `key`s; on component tags `key` preserves the
   instance (and its hook state) across reorders.

## Cross-component state

```ts
import { computed, createStore } from "@lark.js/larky";

export const counterStore = createStore((set, get) => ({
  count: 0,
  doubled: computed(() => get().count * 2),
  increment: () => set({ count: get().count + 1 }),
}));

// in any component body — subscribes to `count` ONLY:
counterStore.getState().count;
```

## Non-goals (by design)

`useState` / deps arrays / `useMemo`, class components, Fiber scheduling,
SSR, hash routing, event emitters, error-swallowing wrappers (errors bubble),
SWR-style server state (belongs in a dedicated package on the same signals).

## Package entry points

| Import                           | Provides                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| `@lark.js/larky`                 | Runtime: render/unmount, signals, hooks, router, store, HMR |
| `@lark.js/larky/jsx-runtime`     | JSX automatic runtime (via `jsxImportSource`)               |
| `@lark.js/larky/jsx-dev-runtime` | `jsxDEV` dev runtime                                        |
| `@lark.js/larky/vite`            | `larkyPlugin()` — JSX defaults + auto component HMR         |
| `@lark.js/larky/webpack`         | `LarkyPlugin` (recommended), `larkyLoader`                  |
| `@lark.js/larky/client`          | Ambient types: HMR globals                                  |

MIT © hangtiancheng
