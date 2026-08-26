/**
 * Registers all `wc-*` custom elements (importing a component module defines
 * it via the `@customElement` decorator) and re-exports the classes.
 *
 * Imported once for side effects from `.storybook/preview.ts`.
 */
import "./button";
import "./card";
import "./select";
import "./counter";

export { WcButton } from "./button";
export type { WcButtonSize, WcButtonVariant } from "./button";
export { WcCard } from "./card";
export type { WcCardSize } from "./card";
export { WcSelect } from "./select";
export type { WcSelectOption, WcSelectSize } from "./select";
export { WcCounter } from "./counter";
