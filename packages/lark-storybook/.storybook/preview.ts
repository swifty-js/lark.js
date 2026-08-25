/// <reference types="vite/client" />

import type { Preview } from "@storybook/html-vite";
// Registers the local Lit web components (side-effect `customElements.define`).
import "../src/wc";
import "../src/styles/global.css";

// No framework boot: larkRender() renders each story's function component
// hostlessly into its own element via the render() root API.

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
