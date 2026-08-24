/**
 * Bridge between Storybook's `@storybook/html` renderer and Lark function
 * components.
 *
 * A story returns a plain `<div>`; the component is rendered into it with
 * `render(jsx(component, props), el)` — hostless, no frames, no registration.
 *
 * ## Args
 *
 * - Every render call passes the current args as props. The reconciler
 *   matches the existing component instance (same function, same position)
 *   and pushes CHANGED props through its per-key signals — nothing is
 *   re-mounted, so `useSignal` state / store subscriptions survive control
 *   tweaks. Opt out per story with `remountOnArgsChange: true`.
 * - Function-valued args (the handlers Storybook injects for `argTypes` with
 *   `{ action: "..." }`) and `undefined` args are stripped from the data
 *   props; the names listed in `events` are instead exposed to the component
 *   as `on{Name}` callback props (`"select"` → `onSelect`) that forward to
 *   the live arg — so child → parent callbacks land in the Actions panel.
 */
import { render, unmount, State } from "@lark.js/mvc";
import type { Component } from "@lark.js/mvc";
import { jsx } from "@lark.js/mvc/jsx-runtime";
import { getChannel } from "storybook/preview-api";

/** Args object shape Storybook hands to a story function. */
type StoryArgs = Record<string, unknown>;

/** The slice of Storybook's story context this bridge needs. */
export interface LarkStoryContext {
  id: string;
}

export interface LarkStoryConfig<TArgs extends object = StoryArgs> {
  /** The function component to render. */
  component: Component;
  /**
   * Event names to expose to the component as `on{Name}` callback props
   * (`"select"` → `onSelect`). Each callback forwards to the like-named
   * function arg. Combine with `argTypes: { select: { action: "select" } }`
   * to get child → parent callbacks in Storybook's Actions panel.
   */
  events?: readonly string[];
  /**
   * Derive `State` keys from args. Applied before each render — `State.set`
   * notifies tracked readers, so stories can drive components whose bodies
   * read `State.get(key)`.
   */
  state?: (args: TArgs) => Record<string, unknown>;
  /**
   * Re-mount the component from scratch on every args change instead of
   * pushing props into the existing instance. Default `false`.
   */
  remountOnArgsChange?: boolean;
}

interface MountedStory {
  /** Storybook story id. */
  storyId: string;
  el: HTMLElement;
  /** Latest args — read live by the forwarded callback props. */
  args: StoryArgs;
  /** Stable `on{Name}` callback props (identity survives arg pushes). */
  handlers: Record<string, (data?: unknown) => void>;
}

/** storyId → mounted story. */
const stories = new Map<string, MountedStory>();

/** Story ids the manager asked to hard-remount (see `bindChannel`). */
const pendingRemount = new Set<string>();

let storySeq = 0;
let channelBound = false;

/**
 * Keep only real data props: functions are event handlers and `undefined`
 * would overwrite the defaults a component applies in its body.
 */
function dataArgs(args: StoryArgs): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(args)) {
    const value = args[key];
    if (typeof value !== "function" && value !== undefined) out[key] = value;
  }
  return out;
}

/** `"select"` → `"onSelect"`. */
function propNameFor(event: string): string {
  return "on" + event.charAt(0).toUpperCase() + event.slice(1);
}

/** Build stable callback props that forward to the LIVE args. */
function makeHandlers(
  entry: MountedStory,
  events: readonly string[],
): Record<string, (data?: unknown) => void> {
  const handlers: Record<string, (data?: unknown) => void> = {};
  for (const name of events) {
    handlers[propNameFor(name)] = (data?: unknown) => {
      const handler = entry.args[name];
      if (typeof handler === "function") (handler as (d?: unknown) => void)(data);
    };
  }
  return handlers;
}

/** The props object for a render pass: current data args + callback props. */
function buildProps(entry: MountedStory): Record<string, unknown> {
  return { ...dataArgs(entry.args), ...entry.handlers };
}

/**
 * Listen for the manager's "remount" request.
 *
 * The story id is only *recorded* here and consumed by the next `render` call,
 * so this never unmounts a tree that Storybook is about to re-use — the
 * relative ordering of this listener and Storybook's own (async) re-render
 * does not matter.
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

/** Tear down a story's component tree. */
function destroy(entry: MountedStory): void {
  unmount(entry.el);
  stories.delete(entry.storyId);
}

/** Reap stories whose container Storybook has removed from the document. */
function sweep(): void {
  for (const entry of [...stories.values()]) {
    if (!entry.el.isConnected) destroy(entry);
  }
}

/**
 * Build a Storybook `render` function that renders a Lark function component.
 *
 * @example
 * const meta: Meta<Args> = {
 *   title: "Components/Button",
 *   render: larkRender<Args>({
 *     component: Button,
 *     events: ["click"], // → onClick prop → the `click` arg → Actions panel
 *   }),
 *   argTypes: { click: { action: "click" } },
 * };
 */
export function larkRender<TArgs extends object = StoryArgs>(
  config: LarkStoryConfig<TArgs>,
): (args: TArgs, context: LarkStoryContext) => HTMLElement {
  const applyState = (args: TArgs): void => {
    if (!config.state) return;
    State.set(config.state(args)); // per-key signals notify tracked readers
  };

  return (args: TArgs, context: LarkStoryContext): HTMLElement => {
    bindChannel();
    sweep();

    const storyArgs = args as StoryArgs;
    const remount =
      pendingRemount.delete(context.id) || config.remountOnArgsChange === true;
    const existing = stories.get(context.id);

    // Re-use the live tree: render() with fresh props diffs in place — the
    // instance is matched by function identity, changed props are pushed
    // through per-key signals, and useSignal state survives. Returning the
    // very same element also makes @storybook/html's renderToCanvas bail out
    // early, so the DOM is never thrown away behind the framework's back.
    if (existing && !remount && existing.el.isConnected) {
      existing.args = storyArgs;
      applyState(args);
      render(jsx(config.component, buildProps(existing)), existing.el);
      return existing.el;
    }

    if (existing) destroy(existing);

    const el = document.createElement("div");
    el.id = `lark-story-${++storySeq}`;

    const entry: MountedStory = {
      storyId: context.id,
      el,
      args: storyArgs,
      handlers: {},
    };
    entry.handlers = makeHandlers(entry, config.events ?? []);
    stories.set(context.id, entry);

    applyState(args);
    // Hostless render works on a detached element — no connection dance.
    render(jsx(config.component, buildProps(entry)), el);

    return el;
  };
}
