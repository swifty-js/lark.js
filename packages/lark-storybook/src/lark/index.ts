/**
 * lark-mvc ⇄ Storybook glue.
 *
 * `larkRender()` is used as the `render` function of a story meta. No boot
 * step is needed — components render hostlessly into the story element via
 * the framework's `render()` root API.
 */
export { larkRender } from "./render";
export type { LarkStoryConfig, LarkStoryContext } from "./render";
