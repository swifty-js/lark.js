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
import { defineView, jsxTemplate, useState } from "@lark.js/mvc";
import styles from "./counter.module.css";

export interface CounterProps {
  label: string;
  step: number;
  initialCount: number;
}

interface CounterData {
  label: string;
  count: number;
  step: number;
}

const template = jsxTemplate<CounterData>(({ label, count, step }) => (
  <div class={styles["counter"]}>
    <div class={styles["counter__label"]}>{label}</div>

    <div class={styles["counter__value"]}>{count}</div>

    <wa-button-group class={styles["counter__actions"]} label="Counter actions">
      <wa-button
        type="button"
        variant="neutral"
        appearance="outlined"
        size="s"
        onClick="decrement"
      >
        - {step}
      </wa-button>
      <wa-button
        type="button"
        variant="neutral"
        appearance="plain"
        size="s"
        onClick="reset"
      >
        Reset
      </wa-button>
      <wa-button
        type="button"
        variant="brand"
        appearance="filled"
        size="s"
        onClick="increment"
      >
        + {step}
      </wa-button>
    </wa-button-group>
  </div>
));

export default defineView((ctx, params) => {
  const props = (params ?? {}) as Partial<CounterProps>;
  const initial = props.initialCount ?? 0;

  const [getCount, setCount] = useState("count", initial);

  ctx.updater.set({
    label: props.label ?? "Counter",
    step: props.step ?? 1,
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
