import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  isAuthenticated: boolean;
  setTokens: (access: string, refresh: string, username: string) => void;
  clearTokens: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      username: null,
      isAuthenticated: false,
      setTokens: (access, refresh, username) =>
        set({ accessToken: access, refreshToken: refresh, username, isAuthenticated: true }),
      clearTokens: () =>
        set({ accessToken: null, refreshToken: null, username: null, isAuthenticated: false }),
    }),
    { name: 'coescd-auth' },
  ),
);
