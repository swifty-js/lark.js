import type { Meta, StoryObj } from "@storybook/html-vite";
import { larkRender } from "../../lark";
import Button, { type ButtonProps } from "./button";

type Args = ButtonProps & {
  /** Injected by the actions addon via the `action` argType below. */
  click?: (data?: unknown) => void;
};

const meta: Meta<Args> = {
  title: "Components/Button",
  render: larkRender<Args>({
    component: Button,
    // `props.onClick?.(...)` → the `click` arg → Actions panel.
    events: ["click"],
  }),
  argTypes: {
    label: { control: "text" },
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost", "destructive", "link"],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    disabled: { control: "boolean" },
    click: { action: "click" },
  },
  args: {
    label: "Click me",
    variant: "primary",
    size: "md",
    disabled: false,
  },
};

export default meta;

type Story = StoryObj<Args>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: "secondary", label: "Secondary" },
};

export const Ghost: Story = {
  args: { variant: "ghost", label: "Ghost" },
};

export const Outline: Story = {
  args: { variant: "outline", label: "Outline" },
};

export const Destructive: Story = {
  args: { variant: "destructive", label: "Delete" },
};

export const Link: Story = {
  args: { variant: "link", label: "Link button" },
};

export const Large: Story = {
  args: { size: "lg", label: "Large button" },
};

export const Disabled: Story = {
  args: { disabled: true, label: "Disabled" },
};
