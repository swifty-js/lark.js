/// <reference types="vite/client" />

import type { Preview } from "@storybook/html-vite";
import { bootLarkStorybook } from "../src/lark";
import "@awesome.me/webawesome/dist/components/avatar/avatar.js";
import "@awesome.me/webawesome/dist/components/badge/badge.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/button-group/button-group.js";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/card/card.js";
import "@awesome.me/webawesome/dist/components/tag/tag.js";
import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "../src/styles/global.css";

// One boot per preview iframe: creates the root Frame on a hidden host element
// and wires the Router/State dispatcher. Story frames are mounted underneath it
// (see src/lark/boot.ts for the full rationale).
bootLarkStorybook();

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
