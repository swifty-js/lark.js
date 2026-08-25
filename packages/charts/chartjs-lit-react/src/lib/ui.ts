import { signal } from "@/lib/signal";

export const showAuthModal = signal(false);

export function openAuthModal() {
  showAuthModal.value = true;
}

export function closeAuthModal() {
  showAuthModal.value = false;
}
