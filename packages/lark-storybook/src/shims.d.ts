/// <reference types="vite/client" />

// Ambient declarations for the assets a Lark view imports.
//
// The `*.html` declaration mirrors `@lark.js/mvc/client`; it is repeated here
// (like packages/lark-demo does) because a `/// <reference types>` cannot point
// at a package sub-path.

declare module "*.html" {
  import type { ViewTemplate } from "@lark.js/mvc";

  const template: ViewTemplate;
  export default template;
}
