/**
 * User card — object/array args, derived data, and a nested imported child
 * component.
 *
 * `user` and `tags` are passed straight through as real objects (Storybook args
 * are JS values, so nothing has to be serialised). The template renders the
 * imported `<TagList/>` component with `tags` and an inline `onSelect` handler;
 * the child's `select` event is re-fired on the story frame so `larkRender`
 * can forward it to the Actions panel.
 *
 * `initials` shows the derived-data pattern: computed inline in the template,
 * which re-runs whenever the `user` params signal changes (shallow — Storybook
 * always pushes a fresh object).
 */
import { defineView, jsxTemplate } from "@lark.js/mvc";
import TagList from "./tag-list";
import styles from "./user-card.module.css";

export interface User {
  name: string;
  role: string;
  email: string;
}

export interface UserCardProps {
  user: User;
  tags: string[];
}

const FALLBACK_USER: User = {
  name: "Unknown",
  role: "—",
  email: "—",
};

/** First letter of each of the first two words of a name. */
function initialsOf(user: User | undefined): string {
  const name = user?.name ?? "";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default defineView<UserCardProps>((ctx, params) => {
  const props = (params ?? {}) as Partial<UserCardProps>;

  const template = jsxTemplate(() => {
    const user = props.user ?? FALLBACK_USER;
    const tags = Array.isArray(props.tags) ? props.tags : [];
    const initials = initialsOf(user);
    return (
      <wa-card class={styles["user-card"]} appearance="outlined" with-header>
        <div slot="header" class={styles["user-card__head"]}>
          <wa-avatar
            class={styles["user-card__avatar"]}
            initials={initials}
            label={user.name}
            shape="circle"
          ></wa-avatar>
          <div>
            <div class={styles["user-card__name"]}>{user.name}</div>
            <div class={styles["user-card__role"]}>{user.role}</div>
          </div>
        </div>

        <wa-button
          class={styles["user-card__email"]}
          href={`mailto:${user.email}`}
          variant="brand"
          appearance="plain"
          size="s"
        >
          {user.email}
        </wa-button>

        <TagList
          class={styles["user-card__tags"]}
          tags={tags}
          onSelect={(data) => {
            ctx.owner.fire("select", { tag: String((data as { tag?: string })?.tag ?? "") });
          }}
        />
      </wa-card>
    );
  });

  return { template };
});
