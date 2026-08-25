/**
 * The compiled Tailwind stylesheet as a Lit `CSSResult`.
 *
 * `?inline` returns the @tailwindcss/vite output as a string instead of
 * injecting a <style> tag; `unsafeCSS` wraps it in a constructable stylesheet
 * that every `lk-*` component adopts via `static styles`. The sheet object is
 * shared — each shadow root adopts the same CSSStyleSheet instance.
 */
import { unsafeCSS } from "lit";
import tailwind from "./tailwind.css?inline";

export const tailwindStyles = unsafeCSS(tailwind);
