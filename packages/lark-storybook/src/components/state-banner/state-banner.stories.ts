import type { Meta, StoryObj } from "@storybook/html-vite";
import { larkRender } from "../../lark";
import StateBanner, { bannerStore } from "./state-banner";

interface Args {
  theme: "light" | "dark";
  message: string;
}

const meta: Meta<Args> = {
  title: "Framework/Store",
  render: larkRender<Args>({
    component: StateBanner,
    // Controls write to the banner's createStore store instead of pushing
    // props; the tracked getState() reads re-render every component
    // observing those keys.
    onArgs: (args) => bannerStore.setState({ theme: args.theme, message: args.message }),
  }),
  argTypes: {
    theme: { control: "inline-radio", options: ["light", "dark"] },
    message: { control: "text" },
  },
  args: {
    theme: "light",
    message: "Hello from the store",
  },
};

export default meta;

type Story = StoryObj<Args>;

export const Light: Story = {};

export const Dark: Story = {
  args: { theme: "dark", message: "The store drives the theme" },
};
