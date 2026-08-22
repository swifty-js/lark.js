/**
 * Counter — internal state (`useState`) next to Storybook-controlled props.
 *
 * Tweaking the `step` control does NOT reset `count`: larkRender pushes args
 * with `updater.set().digest()` instead of re-mounting, exactly like a parent
 * view pushing `*prop` updates through `mountZone`.
 *
 * Note the arg is called `initialCount`, not `count` — args share the updater
 * data namespace with `useState` keys, so a `count` arg would overwrite the
 * live state on every control change.
 */
import { defineView, useState } from "@lark.js/mvc";
import template from "./counter.html";
import styles from "./counter.module.css";

export interface CounterProps {
  label: string;
  step: number;
  initialCount: number;
}

export default defineView((ctx, params) => {
  const props = (params ?? {}) as Partial<CounterProps>;
  const initial = props.initialCount ?? 0;

  const [getCount, setCount] = useState("count", initial);

  ctx.updater.set({
    label: props.label ?? "Counter",
    step: props.step ?? 1,
    styles,
  });

  // Read from updater data, never from the setup closure: `step` changes when
  // Storybook pushes new args, and setup does not run again.
  const step = (): number => ctx.updater.get<number>("step") || 1;

  const change = (next: number): void => {
    setCount(next);
    ctx.owner.fire("change", { count: next });
  };

  return {
    template,
    events: {
      "increment<click>": () => change(getCount() + step()),
      "decrement<click>": () => change(getCount() - step()),
      "reset<click>": () =>
        change(ctx.updater.get<number>("initialCount") ?? initial),
    },
  };
});
