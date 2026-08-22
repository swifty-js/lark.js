import { defineView } from "@lark.js/mvc";
import template from "./tag-list.html";
import styles from "./tag-list.module.css";

export interface TagListProps {
  tags: string[];
}

export default defineView((ctx, params) => {
  const props = (params ?? {}) as Partial<TagListProps>;

  ctx.updater.set({
    tags: Array.isArray(props.tags) ? props.tags : [],
    styles,
  });

  const pick = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    const tag = target?.closest<HTMLElement>("[data-tag]")?.dataset["tag"];
    if (tag) ctx.owner.fire("select", { tag });
  };

  return {
    template,
    events: {
      "pick<click>": pick,
      "pickKey<keydown>": (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        pick(e);
      },
    },
  };
});
