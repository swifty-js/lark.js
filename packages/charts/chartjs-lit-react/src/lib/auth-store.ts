import { createStore } from "@/lib/store";
import { authMeApi, logoutApi, type UserInfo } from "@/lib/api";

interface AuthState {
  loggedIn: boolean;
  user: UserInfo | null;
  loading: boolean;
  fetchUser: () => void;
  logout: () => void;
}

export const useAuthStore = createStore<AuthState>((set) => ({
  loggedIn: false,
  user: null,
  loading: true,

  fetchUser() {
    set({ loading: true });
    authMeApi()
      .then((res) => {
        if (res.ok && res.data) {
          set({ loggedIn: true, user: res.data, loading: false });
        } else {
          set({ loggedIn: false, user: null, loading: false });
        }
      })
      .catch(() => {
        set({ loggedIn: false, user: null, loading: false });
      });
  },

  logout() {
    logoutApi().then(() => {
      set({ loggedIn: false, user: null });
      window.location.href = `${import.meta.env.BASE_URL}plaza`;
    });
  },
}));
