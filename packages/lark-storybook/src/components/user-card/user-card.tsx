/**
 * User card — object/array args, derived data, and a nested `v-lark` child.
 *
 * `user` and `tags` are passed straight through as real objects (Storybook args
 * are JS values, so nothing has to be serialised). The template hands `tags` to
 * the child view with the `{{@tags}}` ref token and receives the child's
 * `select` event through `@select="selectTag"`, which is re-fired on the story
 * frame so `larkRender` can forward it to the Actions panel.
 *
 * The `initials` field shows the standard derived-data pattern: an `assign()`
 * that snapshots, recomputes and reports whether anything changed, wired into
 * `ctx.renderMethod` so every framework-driven render refreshes it.
 */
import { defineView, jsxTemplate } from "@lark.js/mvc";
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

interface UserCardData {
  user: User;
  initials: string;
  tags: string[];
}

const template = jsxTemplate<UserCardData>(({ user, initials, tags }) => (
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

    <div
      class={styles["user-card__tags"]}
      v-lark="components/user-card/tag-list"
      prop:tags={tags}
      onSelect="selectTag"
    ></div>
  </wa-card>
));

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

export default defineView((ctx, params) => {
  const props = (params ?? {}) as Partial<UserCardProps>;

  ctx.updater.set({
    user: props.user ?? FALLBACK_USER,
    tags: props.tags ?? [],
  });

  const assign = (): boolean | undefined => {
    ctx.updater.snapshot();
    const user = ctx.updater.get<User>("user") ?? FALLBACK_USER;
    ctx.updater.set({ user, initials: initialsOf(user) });
    return ctx.updater.altered();
  };

  // Setup runs once, so derive for the first render here...
  assign();
  // ...and again on every framework-driven render (State/Router changes plus the
  // prop pushes larkRender performs when Storybook args change).
  ctx.renderMethod = () => {
    assign();
    ctx.updater.digest();
  };

  return {
    template,
    assign,
    events: {
      // Bound to the child's `select` event by `@select="selectTag"`.
      "selectTag<click>": (data?: { tag?: string }) => {
        ctx.owner.fire("select", { tag: data?.tag ?? "" });
      },
    },
  };
});
