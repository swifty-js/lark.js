import { createStore } from "@/lib/store";

/**
 * Global UI state as a plain module store (lark-react has no `signal`;
 * components read it with `useStore(uiStore)`).
 */
export const uiStore = createStore<{ showAuthModal: boolean }>(() => ({
  showAuthModal: false,
}));

export function openAuthModal(): void {
  uiStore.setState({ showAuthModal: true });
}

export function closeAuthModal(): void {
  uiStore.setState({ showAuthModal: false });
}
