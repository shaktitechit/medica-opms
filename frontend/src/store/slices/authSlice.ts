/**
 * `/api/auth` — session + user profile.
 * Persisted to `localStorage` by middleware in `store.ts` (`AUTH_STORAGE_KEY`).
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { DomainSliceState } from "./common";
import { emptyDomainState } from "./common";

export const AUTH_STORAGE_KEY = "medica.auth";

/** Shape from JWT payload / `/api/auth/me` — extend when you add Typed models. */
export type AuthUser = Record<string, unknown>;

export interface AuthState extends DomainSliceState {
  token: string | null;
  user: AuthUser | null;
}

export const authInitialState: AuthState = {
  ...emptyDomainState(),
  token: null,
  user: null,
};

/** Read persisted auth (client-only; safe empty on SSR / first paint). */
export function readAuthFromStorage(): Partial<Pick<AuthState, "token" | "user">> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Pick<AuthState, "token" | "user">>;
    return {
      token: typeof parsed.token === "string" ? parsed.token : null,
      user: parsed.user && typeof parsed.user === "object"
        ? (parsed.user as AuthUser)
        : null,
    };
  } catch {
    return {};
  }
}

export function writeAuthToStorage(state: AuthState): void {
  if (typeof window === "undefined") return;
  try {
    if (!state.token && !state.user) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token: state.token, user: state.user }),
    );
  } catch {
    /* ignore quota / privacy mode */
  }
}

/** Hydrate slice from `localStorage` (call from `makeStore` preloadedState on client only). */
export function hydrateAuthState(): AuthState {
  const { token = null, user = null } = readAuthFromStorage();
  return {
    ...authInitialState,
    token,
    user,
    status: token || user ? "succeeded" : "idle",
  };
}

export const authSlice = createSlice({
  name: "auth",
  initialState: authInitialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{ token?: string | null; user?: AuthUser | null }>,
    ) {
      if ("token" in action.payload) state.token = action.payload.token ?? null;
      if ("user" in action.payload) state.user = action.payload.user ?? null;
      state.error = null;
    },
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
    },
    setToken(state, action: PayloadAction<string | null>) {
      state.token = action.payload;
    },
    setAuthError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.status = action.payload ? "failed" : "idle";
    },
    logout() {
      return { ...authInitialState };
    },
    reset(state) {
      Object.assign(state, authInitialState);
    },
  },
});

export const {
  setCredentials,
  setUser,
  setToken,
  setAuthError,
  logout,
  reset: resetAuth,
} = authSlice.actions;

export default authSlice.reducer;
