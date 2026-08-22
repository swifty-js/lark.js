import type { Meta, StoryObj } from "@storybook/html-vite";
import { larkRender } from "../../lark";
import Counter, { type CounterProps } from "./counter";

type Args = CounterProps & {
  change?: (data?: unknown) => void;
};

const meta: Meta<Args> = {
  title: "Components/Counter",
  render: larkRender<Args>({
    path: "components/counter",
    view: Counter,
    events: ["change"],
  }),
  argTypes: {
    label: { control: "text" },
    step: { control: { type: "number", min: 1, max: 25 } },
    initialCount: { control: "number" },
    change: { action: "change" },
  },
  args: {
    label: "Counter",
    step: 1,
    initialCount: 0,
  },
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

/**
 * Click a few times, then change `step` in the Controls panel: the value keeps
 * its state because the args are pushed into the live view instead of causing a
 * re-mount. Use the toolbar's remount button to reset.
 */
export const BigStep: Story = {
  args: { step: 10, label: "Step of 10" },
};

export const StartsAtFifty: Story = {
  args: { initialCount: 50, label: "Starts at 50" },
};

/** Same view, but every args change tears the view down and mounts it again. */
export const RemountOnArgsChange: Story = {
  render: larkRender<Args>({
    path: "components/counter",
    view: Counter,
    events: ["change"],
    remountOnArgsChange: true,
  }),
};
