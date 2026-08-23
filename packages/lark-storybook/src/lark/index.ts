/**
 * Lark Mvc ⇄ Storybook glue.
 *
 * `bootLarkStorybook()` belongs in `.storybook/preview.ts`; `larkRender()`
 * is used as the `render` function of a story meta.
 */
export { bootLarkStorybook, getLarkHostFrame } from "./boot";
export type { BootLarkOptions } from "./boot";
export { larkRender } from "./render";
export type { LarkStoryConfig, LarkStoryContext } from "./render";
