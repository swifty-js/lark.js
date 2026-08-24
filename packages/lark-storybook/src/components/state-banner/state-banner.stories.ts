import type { Meta, StoryObj } from "@storybook/html-vite";
import { larkRender } from "../../lark";
import StateBanner from "./state-banner";

interface Args {
  theme: "light" | "dark";
  message: string;
}

const meta: Meta<Args> = {
  title: "Framework/State",
  render: larkRender<Args>({
    component: StateBanner,
    // Controls write to the State singleton instead of pushing props; the
    // tracked State.get() reads re-render every component observing them.
    state: (args) => ({ sbTheme: args.theme, sbMessage: args.message }),
  }),
  argTypes: {
    theme: { control: "inline-radio", options: ["light", "dark"] },
    message: { control: "text" },
  },
  args: {
    theme: "light",
    message: "Hello from State",
  },
};

export default meta;

type Story = StoryObj<Args>;

export const Light: Story = {};

export const Dark: Story = {
  args: { theme: "dark", message: "State drives the theme" },
};
