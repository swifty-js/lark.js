import { signal } from "@lark.js/larky";

export const showAuthModal = signal(false);

export function openAuthModal() {
  showAuthModal.value = true;
}

export function closeAuthModal() {
  showAuthModal.value = false;
}
