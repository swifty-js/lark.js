import type { Meta, StoryObj } from "@storybook/html-vite";
import { larkRender } from "../../lark";
import Select, { type SelectProps } from "./select";

type Args = SelectProps & {
  /** Injected by the actions addon via the `action` argType below. */
  change?: (data?: unknown) => void;
};

const meta: Meta<Args> = {
  title: "Components/Select",
  render: larkRender<Args>({
    component: Select,
    // `props.onChange?.(...)` → the `change` arg → Actions panel.
    events: ["change"],
  }),
  argTypes: {
    label: { control: "text" },
    placeholder: { control: "text" },
    options: { control: "object" },
    initialValue: { control: "text" },
    disabled: { control: "boolean" },
    size: { control: "inline-radio", options: ["sm", "md"] },
    change: { action: "change" },
  },
  args: {
    label: "Framework",
    placeholder: "Pick a framework…",
    options: ["Lark", "Lit", "React", "Vue", "Svelte"],
    initialValue: "",
    disabled: false,
    size: "md",
  },
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Preselected: Story = {
  args: { initialValue: "Lark", label: "Preselected" },
};

export const Small: Story = {
  args: { size: "sm", label: "Small" },
};

export const Disabled: Story = {
  args: { disabled: true, label: "Disabled" },
};
