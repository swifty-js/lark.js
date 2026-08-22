import type { Meta, StoryObj } from "@storybook/html-vite";
import { larkRender } from "../../lark";
import UserCard, { type UserCardProps } from "./user-card";
import TagList from "./tag-list";

type Args = UserCardProps & {
  select?: (data?: unknown) => void;
};

const meta: Meta<Args> = {
  title: "Components/UserCard",
  render: larkRender<Args>({
    path: "components/user-card",
    view: UserCard,
    // The `v-lark` child must be registered up front: story rendering is
    // synchronous and never goes through `FrameworkConfig.require`.
    children: { "components/user-card/tag-list": TagList },
    events: ["select"],
  }),
  argTypes: {
    user: { control: "object" },
    tags: { control: "object" },
    select: { action: "select" },
  },
  args: {
    user: {
      name: "Ada Lovelace",
      role: "Frontend Engineer",
      email: "ada@example.com",
    },
    tags: ["lark", "vite", "storybook"],
  },
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

/** Editing the `user` object in Controls updates the card without a re-mount. */
export const OtherUser: Story = {
  args: {
    user: {
      name: "Grace Hopper",
      role: "Compiler Author",
      email: "grace@example.com",
    },
    tags: ["cobol"],
  },
};

/** The child view renders its own empty state. */
export const NoTags: Story = {
  args: { tags: [] },
};
