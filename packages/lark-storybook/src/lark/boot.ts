/**
 * Boots the Lark Mvc runtime once per Storybook preview iframe.
 *
 * ## Why a hidden host frame?
 *
 * `Framework.boot()` is a global, single-shot operation: it creates the one
 * root Frame, wires `Router.CHANGED` / `State.CHANGED` into the dispatcher and
 * binds the history listeners. Stories, on the other hand, come and go inside
 * a canvas element that Storybook owns and wipes at will.
 *
 * So the root Frame is pointed at a hidden `<div>` that lives outside the
 * canvas, and every story is mounted as a CHILD frame of it (see `render.ts`).
 * Two framework details drive this design:
 *
 * 1. `dispatcherUpdate` (framework.ts) walks the frame tree from the root and
 *    `continue`s — without visiting children — on any frame whose view is
 *    missing or whose `signature <= 1`. A bare root frame would therefore
 *    swallow every `State.digest()` and no story could use `ctx.observeState`.
 *    Fix: mount a template-less host view on the root and render it once, which
 *    lifts its signature to 2 and turns it into a transparent pass-through.
 *
 * 2. On a route change whose `view` actually differs, the dispatcher calls
 *    `rootFrame.mountView(...)`, which unmounts the root's whole zone — i.e. it
 *    would destroy every mounted story. Fix: boot with `defaultView` = the host
 *    view and NO `routes`, so `attachViewAndPath()` resolves every path to that
 *    same view. The `view` diff is then always empty and only the harmless
 *    "params changed" branch of the dispatcher ever runs.
 *
 * The net effect: `State`, `Router`, `useUrlState` and `observeLocation` all
 * work inside stories, and nothing the router does can wipe the canvas.
 */
import { Framework, Frame, defineView, registerViewClass } from "@lark.js/mvc";
import type { FrameObj, FrameworkConfig } from "@lark.js/mvc";

/** DOM id of the hidden element that hosts the root Frame. */
const HOST_ELEMENT_ID = "lark-storybook-host";

/** View path of the no-op host view mounted on the root Frame. */
const HOST_VIEW_PATH = "__lark_storybook_host__";

/**
 * Boot options. `rootId`, `routes`, `unmatchedView` and `defaultView` are
 * managed by this module and cannot be overridden.
 */
export type BootLarkOptions = Omit<
  Partial<FrameworkConfig>,
  "rootId" | "routes" | "unmatchedView" | "defaultView"
>;

/** Ensure the hidden host element exists and is attached to the document. */
function ensureHostElement(): HTMLElement {
  let host = document.getElementById(HOST_ELEMENT_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ELEMENT_ID;
    host.hidden = true;
    host.style.display = "none";
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Boot the framework for Storybook. Idempotent — safe to call from
 * `preview.ts` and again from every story render.
 */
export function bootLarkStorybook(options: BootLarkOptions = {}): void {
  if (Framework.isBooted()) return;

  ensureHostElement();

  // A view with no template: mountCtx() calls ctx.endUpdate() instead of
  // ctx.render(), so nothing is ever written into the hidden host element.
  registerViewClass(
    HOST_VIEW_PATH,
    defineView(() => ({})),
  );

  Framework.boot({
    // Hash mode leaves Storybook's own `iframe.html?id=...` query string alone.
    routeMode: "hash",
    error(e: Error) {
      console.error("[lark-storybook]", e);
    },
    ...options,
    rootId: HOST_ELEMENT_ID,
    defaultView: HOST_VIEW_PATH,
  });

  // The host view has no template, so its signature is still 1 and the
  // State/Router dispatcher would skip it *and its children*. One render()
  // bumps it to 2; the digest itself is a no-op (no template, no dirty data).
  Frame.getRoot()?.view?.render();
}

/**
 * The root Frame that story frames are attached to. Available after
 * `bootLarkStorybook()`.
 */
export function getLarkHostFrame(): FrameObj | undefined {
  return Frame.getRoot();
}
