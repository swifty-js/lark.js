/// <reference types="vite/client" />
/// <reference types="@lark.js/mvc/client" />

declare module "*.html" {
  import { ViewTemplate, VDomTemplate } from "@lark.js/mvc";
  const template: ViewTemplate | VDomTemplate;
  export default template;
}
