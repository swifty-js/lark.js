/**
 * Store banner — proves store reactivity reaches story components.
 *
 * The component never receives props: the story writes to `bannerStore`
 * (via `larkRender({ onArgs })`) and the body's `getState()` reads subscribe
 * this instance — the write re-renders it automatically.
 */
import { createStore } from "@lark.js/mvc";
import styles from "./state-banner.module.css";

export interface BannerState {
  theme: string;
  message: string;
}

/** Story-driven store. Module-scoped — the story writes, the banner reads. */
export const bannerStore = createStore<BannerState>(() => ({
  theme: "light",
  message: "(no message)",
}));

export default function StateBanner() {
  const { theme, message } = bannerStore.getState(); // tracked per-key reads
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
          theme
        </wa-badge>
        <span class={styles["state-banner__value"]}>{theme}</span>
      </div>
      <div class={styles["state-banner__row"]}>
        <wa-badge variant="neutral" appearance="outlined">
          message
        </wa-badge>
        <span class={styles["state-banner__value"]}>{message}</span>
      </div>
      <p class={styles["state-banner__hint"]}>
        Rendered from a createStore store via tracked getState() reads
      </p>
    </wa-callout>
  );
}
