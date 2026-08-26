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
 * The `<wc-card>` web component provides `header` / `footer` slots; the
 * slotted elements here are ordinary light DOM styled with inline Tailwind
 * utilities, reconciled in place by lark.
 *
 * `initials` shows the derived-data pattern: computed inline in the body,
 * which re-runs whenever the `user` prop signal changes (shallow — Storybook
 * always pushes a fresh object).
 */
import TagList from "./tag-list";

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
    <wc-card class="block w-75">
      <div slot="header" class="flex items-center gap-3">
        <div
          class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {initials}
        </div>
        <div>
          <div class="text-base font-semibold">{user.name}</div>
          <div class="text-xs text-muted-foreground">{user.role}</div>
        </div>
      </div>

      <wc-button
        class="font-mono"
        href={`mailto:${user.email}`}
        variant="link"
        size="sm"
      >
        {user.email}
      </wc-button>

      <div slot="footer" class="w-full">
        <TagList
          tags={tags}
          onSelect={(data) =>
            props.onSelect?.({ tag: String(data?.tag ?? "") })
          }
        />
      </div>
    </wc-card>
  );
}
