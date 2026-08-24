/**
 * State banner — proves State reactivity reaches story components.
 *
 * The component never receives props: the story writes to the `State`
 * singleton (via `larkRender({ state })`) and the body's `State.get(...)`
 * reads subscribe this instance — the write re-renders it automatically.
 */
import { useEffect, State } from "@lark.js/mvc";
import styles from "./state-banner.module.css";

/** State keys this component reads. Namespaced to avoid clashes across stories. */
export const STATE_KEYS = "sbTheme,sbMessage";

export default function StateBanner() {
  // Reference-counted cleanup: the keys are dropped from State when the last
  // observing instance unmounts (i.e. when the story is torn down).
  useEffect(() => State.clean(STATE_KEYS), []);

  const theme = State.get<string>("sbTheme") || "light";
  const message = State.get<string>("sbMessage") || "(no message)";
  const waVariant = theme === "dark" ? "neutral" : "brand";
  const waAppearance = theme === "dark" ? "filled" : "outlined";
  return (
    <wa-callout
      class={styles["state-banner"]}
      variant={waVariant}
      appearance={waAppearance}
      size="m"
    >
      <div class={styles["state-banner__row"]}>
        <wa-badge variant="neutral" appearance="outlined">
          sbTheme
        </wa-badge>
        <span class={styles["state-banner__value"]}>{theme}</span>
      </div>
      <div class={styles["state-banner__row"]}>
        <wa-badge variant="neutral" appearance="outlined">
          sbMessage
        </wa-badge>
        <span class={styles["state-banner__value"]}>{message}</span>
      </div>
      <p class={styles["state-banner__hint"]}>
        Rendered from the State singleton via tracked State.get() reads
      </p>
    </wa-callout>
  );
}
