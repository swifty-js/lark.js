/// <reference types="vite/client" />

import type { Preview } from "@storybook/html-vite";
import "@awesome.me/webawesome/dist/components/avatar/avatar.js";
import "@awesome.me/webawesome/dist/components/badge/badge.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/button-group/button-group.js";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/card/card.js";
import "@awesome.me/webawesome/dist/components/tag/tag.js";
import "@awesome.me/webawesome/dist/styles/webawesome.css";
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
