import { signal } from "@lark.js/mvc";

/** Global UI state as plain module signals (lark: no State singleton). */
export const showAuthModal = signal(false);

export function openAuthModal() {
  showAuthModal.value = true;
}

export function closeAuthModal() {
  showAuthModal.value = false;
}
