/**
 * `wc-*` custom-element registrations for Lark JSX.
 *
 * `JSX.IntrinsicElements` is strict — unknown tags are compile errors — so
 * the local Lit components (src/wc) are registered here via module
 * augmentation (declaration merging into `@lark.js/mvc/jsx-runtime`).
 *
 * Only DATA attributes are declared: the lark runtime serializes them as
 * plain attributes and Lit's `@property` converters turn them back into
 * typed properties. Events (`onClick`, `onChange`, …) already come from
 * `HTMLAttributes`; the components dispatch composed `CustomEvent`s, so
 * handlers receive an `Event` and narrow to `CustomEvent` themselves.
 */
import type { HTMLAttributes } from "@lark.js/mvc";

declare module "@lark.js/mvc/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "wc-button": HTMLAttributes<HTMLElement> & {
        variant?:
          | "default"
          | "outline"
          | "secondary"
          | "ghost"
          | "destructive"
          | "link";
        size?: "sm" | "default" | "lg";
        type?: "button" | "submit" | "reset";
        disabled?: boolean;
        href?: string;
      };
      "wc-card": HTMLAttributes<HTMLElement> & {
        size?: "default" | "sm";
      };
      "wc-select": HTMLAttributes<HTMLElement> & {
        /** JSON array of `string | { label, value }` (Lit Array converter). */
        options?: string;
        value?: string;
        placeholder?: string;
        size?: "sm" | "default";
        disabled?: boolean;
      };
      "wc-counter": HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: number;
        step?: number;
        initial?: number;
      };
    }
  }
}
