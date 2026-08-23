/**
 * Counter — internal signal state next to Storybook-controlled props.
 *
 * Tweaking the `step` control does NOT reset `count`: larkRender pushes args
 * through the frame's params signals instead of re-mounting, exactly like a
 * parent view pushing component props through `mountZone`. The template reads
 * `params.step` / `params.label` (tracked), so control changes re-render.
 *
 * Note the arg is called `initialCount`, not `count` — `count` lives in a
 * view-local signal and only its initial value comes from the args.
 */
import { defineView, jsxTemplate, useSignal } from "@lark.js/mvc";
import styles from "./counter.module.css";

export interface CounterProps {
  label: string;
  step: number;
  initialCount: number;
}

export default defineView<CounterProps>((ctx, params) => {
  const props = (params ?? {}) as Partial<CounterProps>;
  const initial = props.initialCount ?? 0;

  const count = useSignal("count", initial);

  // Read props lazily (tracked in the template) — Storybook pushes new args
  // through the params signals and setup does not run again.
  const step = (): number => props.step ?? 1;

  const change = (next: number): void => {
    count.value = next;
    ctx.owner.fire("change", { count: next });
  };

  const template = jsxTemplate(() => (
    <div class={styles["counter"]}>
      <div class={styles["counter__label"]}>{props.label ?? "Counter"}</div>

      <div class={styles["counter__value"]}>{count.value}</div>

      <wa-button-group class={styles["counter__actions"]} label="Counter actions">
        <wa-button
          type="button"
          variant="neutral"
          appearance="outlined"
          size="s"
          onClick={() => change(count.value - step())}
        >
          - {step()}
        </wa-button>
        <wa-button
          type="button"
          variant="neutral"
          appearance="plain"
          size="s"
          onClick={() => change(props.initialCount ?? initial)}
        >
          Reset
        </wa-button>
        <wa-button
          type="button"
          variant="brand"
          appearance="filled"
          size="s"
          onClick={() => change(count.value + step())}
        >
          + {step()}
        </wa-button>
      </wa-button-group>
    </div>
  ));

  return { template };
});
