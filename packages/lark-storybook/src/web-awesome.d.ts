/**
 * Web Awesome custom-element registrations for Lark JSX.
 *
 * `JSX.IntrinsicElements` is strict — unknown tags are compile errors —
 * so third-party custom elements are registered here via module
 * augmentation (declaration merging into `@lark.js/mvc/jsx-runtime`).
 */
import type { HTMLAttributes } from "@lark.js/mvc";

/**
 * Shared attribute surface for Web Awesome elements: typed events /
 * class / style / ref from the framework, the common design props, and a
 * permissive catch-all for the rest of each component's large API (the
 * lark runtime serializes any attribute).
 */
type WebAwesomeElementAttributes = HTMLAttributes<HTMLElement> & {
  [attr: string]: unknown;
  variant?: string;
  appearance?: string;
  size?: string;
};

declare module "@lark.js/mvc/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "wa-avatar": WebAwesomeElementAttributes;
      "wa-badge": WebAwesomeElementAttributes;
      "wa-button": WebAwesomeElementAttributes;
      "wa-button-group": WebAwesomeElementAttributes;
      "wa-callout": WebAwesomeElementAttributes;
      "wa-card": WebAwesomeElementAttributes;
      "wa-tag": WebAwesomeElementAttributes;
    }
  }
}
