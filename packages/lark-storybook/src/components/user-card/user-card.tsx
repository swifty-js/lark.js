/**
 * User card — object/array args, derived data, and a nested imported child
 * component.
 *
 * `user` and `tags` are passed straight through as real objects (Storybook args
 * are JS values, so nothing has to be serialised). The body renders the
 * imported `<TagList/>` component with `tags` and an inline `onSelect`
 * callback that forwards to this component's own `onSelect` prop — plain
 * callback composition, React style.
 *
 * `initials` shows the derived-data pattern: computed inline in the body,
 * which re-runs whenever the `user` prop signal changes (shallow — Storybook
 * always pushes a fresh object).
 */
import TagList from "./tag-list";
import styles from "./user-card.module.css";

export interface User {
  name: string;
  role: string;
  email: string;
}

export interface UserCardProps {
  user?: User;
  tags?: string[];
  /** Child → parent callback (wired to the Actions panel by larkRender). */
  onSelect?: (data: { tag: string }) => void;
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

export default function UserCard(props: UserCardProps) {
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
        onSelect={(data) => props.onSelect?.({ tag: String(data?.tag ?? "") })}
      />
    </wa-card>
  );
}
