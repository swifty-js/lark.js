/**
 * State banner — proves the `State` dispatcher reaches story frames.
 *
 * The view declares `ctx.observeState(...)` and never receives props: the story
 * writes to the `State` singleton (via `larkRender({ state })`), calls
 * `State.digest()`, and the framework dispatcher walks the frame tree down to
 * this view and re-renders it.
 */
import { defineView, State } from "@lark.js/mvc";
import template from "./state-banner.html";
import styles from "./state-banner.module.css";

/** State keys this view observes. Namespaced to avoid clashes across stories. */
export const STATE_KEYS = "sbTheme,sbMessage";

export default defineView((ctx) => {
  ctx.observeState(STATE_KEYS);
  // Reference-counted cleanup: the keys are dropped from State when the last
  // observing view is destroyed (i.e. when the story is unmounted).
  State.clean(STATE_KEYS)(ctx);

  const assign = (): boolean | undefined => {
    ctx.updater.snapshot();
    const theme = State.get<string>("sbTheme") || "light";
    ctx.updater.set({
      theme,
      message: State.get<string>("sbMessage") || "(no message)",
      waVariant: theme === "dark" ? "neutral" : "brand",
      waAppearance: theme === "dark" ? "filled" : "outlined",
    });
    return ctx.updater.altered();
  };

  ctx.updater.set({ styles });
  assign();

  ctx.renderMethod = () => {
    assign();
    ctx.updater.digest();
  };

  return { template, assign };
});
