import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp() {
    // customElements only exists in the browser; SSR renders the bare tag.
    if (typeof window !== "undefined") {
      void import("./element");
    }
  },
};

export default theme;
