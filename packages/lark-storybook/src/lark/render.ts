/**
 * Bridge between Storybook's `@storybook/html` renderer and Lark views.
 *
 * A story returns a plain `<div id="lark-story-N">`. Storybook appends it to
 * the canvas; on the next microtask (once the element is really in the
 * document, which `frame.mountView` requires) the div is turned into a Lark
 * child frame of the hidden host frame and the view is mounted into it.
 *
 * ## Args
 *
 * - First render: args are passed as `viewInitParams`, i.e. they arrive as the
 *   `params` argument of the view's setup function.
 * - Later renders: args are merged with `view.updater.set(args)` — the same
 *   push `frame.mountZone` performs for component props — followed by
 *   `view.render()`, so a view that installs a `ctx.renderMethod`
 *   gets to re-derive its data. Nothing is re-mounted, so `useState` / store
 *   subscriptions survive control tweaks. Opt out per story with
 *   `remountOnArgsChange: true`.
 * - Function-valued args (the handlers Storybook injects for `argTypes` with
 *   `{ action: "..." }`) and `undefined` args are stripped before they reach the
 *   updater; functions are instead wired to the frame events listed in `events`.
 */
import { Frame, State, registerViewClass, ensureViewName } from "@lark.js/mvc";
import type { AnyLarkView, FrameObj, ViewSetup } from "@lark.js/mvc";
import { getChannel } from "storybook/preview-api";
import { bootLarkStorybook, getLarkHostFrame } from "./boot";

/** Args object shape Storybook hands to a story function. */
type StoryArgs = Record<string, unknown>;

/** The slice of Storybook's story context this bridge needs. */
export interface LarkStoryContext {
  id: string;
}

export interface LarkStoryConfig<TArgs extends object = StoryArgs> {
  /** The component returned by `defineView` (or a plain setup function). */
  view: ViewSetup | AnyLarkView;
  /**
   * Optional explicit view path for registration and mounting. Defaults to
   * the component's auto-registered internal name. Embedded child components
   * need no registration — they auto-register when the template serializes.
   */
  path?: string;
  /**
   * Frame event names (as fired by `ctx.owner.fire(name, data)`) to forward to
   * the like-named function arg. Combine with
   * `argTypes: { increment: { action: "increment" } }` to get child → parent
   * events in Storybook's Actions panel.
   */
  events?: readonly string[];
  /**
   * Derive `State` keys from args. Applied (with `State.digest()`) before each
   * render, so stories can drive views that use `ctx.observeState` / `useStore`.
   */
  state?: (args: TArgs) => Record<string, unknown>;
  /**
   * Re-mount the view from scratch on every args change instead of pushing
   * props into the existing view. Default `false`.
   */
  remountOnArgsChange?: boolean;
}

interface MountedStory {
  /** Frame id === DOM id of the container element. */
  frameId: string;
  /** Storybook story id. */
  storyId: string;
  el: HTMLElement;
  /** Latest args — read live by the forwarded event handlers. */
  args: StoryArgs;
  /** Lark view path. */
  path: string;
  /** Frame events forwarded to function args. */
  events: readonly string[];
  mounted: boolean;
}

/** storyId → mounted story. */
const stories = new Map<string, MountedStory>();

/** Story ids the manager asked to hard-remount (see `bindChannel`). */
const pendingRemount = new Set<string>();

let frameSeq = 0;
let channelBound = false;

/**
 * Keep only real template data: functions are event handlers and `undefined`
 * would overwrite the defaults a view applies in its setup.
 */
function dataArgs(args: StoryArgs): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(args)) {
    const value = args[key];
    if (typeof value !== "function" && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Listen for the manager's "remount" request.
 *
 * The story id is only *recorded* here and consumed by the next `render` call,
 * so this never destroys a frame that Storybook is about to re-use — the
 * relative ordering of this listener and Storybook's own (async) re-render does
 * not matter.
 */
function bindChannel(): void {
  if (channelBound) return;
  try {
    const channel = getChannel();
    if (!channel) return;
    channel.on("forceRemount", (payload: { storyId?: string } | undefined) => {
      if (payload?.storyId) {
        pendingRemount.add(payload.storyId);
      } else {
        for (const storyId of stories.keys()) pendingRemount.add(storyId);
      }
    });
    channelBound = true;
  } catch {
    // No channel (e.g. a static docs build) — args changes still work, the
    // toolbar's remount button just becomes a no-op.
  }
}

/** Tear down a story's frame and clear its container. */
function destroy(entry: MountedStory): void {
  const host = getLarkHostFrame();
  if (host && host.childrenMap[entry.frameId]) {
    // Unmounts the view, then removes the frame from the registry and from the
    // host frame's children map.
    host.unmountFrame(entry.frameId);
  } else {
    Frame.get(entry.frameId)?.unmountView();
    Frame.getAll().delete(entry.frameId);
  }
  entry.el.innerHTML = "";
  entry.mounted = false;
  stories.delete(entry.storyId);
}

/** Reap stories whose container Storybook has removed from the document. */
function sweep(): void {
  for (const entry of [...stories.values()]) {
    if (!entry.el.isConnected) destroy(entry);
  }
}

/** Forward frame events to the matching function arg. */
function bindEvents(frame: FrameObj, entry: MountedStory): void {
  for (const name of entry.events) {
    frame.on(name, (data?: Record<string, unknown>) => {
      const handler = entry.args[name];
      if (typeof handler === "function")
        (handler as (d?: unknown) => void)(data);
    });
  }
}

/**
 * Run `cb` once `el` is in the document. Storybook appends the story element
 * synchronously right after the story function returns, so the microtask is
 * normally enough; the rAF loop is a bounded safety net.
 */
function whenConnected(el: HTMLElement, cb: () => void): void {
  let tries = 0;
  const check = (): void => {
    if (el.isConnected) {
      cb();
      return;
    }
    if (++tries > 60) return;
    requestAnimationFrame(check);
  };
  queueMicrotask(check);
}

/** Create the child frame and mount the view into it. */
function mount(entry: MountedStory): void {
  const host = getLarkHostFrame();
  if (!host) {
    console.error(
      "[lark-storybook] no host frame — did bootLarkStorybook() run?",
    );
    return;
  }
  const frame = host.mountFrame(
    entry.frameId,
    entry.path,
    dataArgs(entry.args),
  );
  entry.mounted = true;
  bindEvents(frame, entry);
}

/**
 * Build a Storybook `render` function that mounts a Lark view.
 *
 * @example
 * const meta: Meta<Args> = {
 *   title: "Components/Button",
 *   render: larkRender<Args>({
 *     path: "components/button",
 *     view: Button,
 *     events: ["click"],
 *   }),
 *   argTypes: { click: { action: "click" } },
 * };
 */
export function larkRender<TArgs extends object = StoryArgs>(
  config: LarkStoryConfig<TArgs>,
): (args: TArgs, context: LarkStoryContext) => HTMLElement {
  let mountPath: string;
  if (config.path) {
    mountPath = config.path;
    registerViewClass(mountPath, config.view);
  } else {
    mountPath = ensureViewName(config.view);
  }

  const applyState = (args: TArgs): void => {
    if (!config.state) return;
    State.set(config.state(args));
    State.digest();
  };

  return (args: TArgs, context: LarkStoryContext): HTMLElement => {
    bootLarkStorybook();
    bindChannel();
    sweep();

    const storyArgs = args as StoryArgs;
    const remount =
      pendingRemount.delete(context.id) || config.remountOnArgsChange === true;
    const existing = stories.get(context.id);

    // Re-use the live frame and push the new args as props. Returning the very
    // same element also makes @storybook/html's renderToCanvas bail out early
    // (`canvasElement.firstChild === element && !forceRemount`), so the DOM is
    // never thrown away behind the framework's back.
    if (existing && !remount && existing.el.isConnected) {
      existing.args = storyArgs;
      applyState(args);
      const view = Frame.get(existing.frameId)?.view;
      // Not yet mounted → the pending mount will pick up `entry.args` itself.
      if (view && view.signature.value > 0) {
        view.updater.set(dataArgs(storyArgs));
        // render() runs `ctx.renderMethod` when the view defines one and falls
        // back to `updater.digest()`; either way an unchanged data set is a
        // no-op.
        view.render();
      }
      return existing.el;
    }

    if (existing) destroy(existing);

    const frameId = `lark-story-${++frameSeq}`;
    const el = document.createElement("div");
    el.id = frameId;
    el.dataset["larkView"] = mountPath;

    const entry: MountedStory = {
      frameId,
      storyId: context.id,
      el,
      args: storyArgs,
      path: mountPath,
      events: config.events ?? [],
      mounted: false,
    };
    stories.set(context.id, entry);

    applyState(args);
    whenConnected(el, () => {
      // A newer render may have replaced this entry while we waited.
      if (stories.get(context.id) === entry) mount(entry);
    });

    return el;
  };
}
