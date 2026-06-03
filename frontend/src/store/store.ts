import { combineReducers, configureStore, type Middleware } from "@reduxjs/toolkit";

import "./api/inject-registry";
import { medicaApi } from "./api/baseApi";
import { mutationToastMiddleware } from "./mutation-toast-middleware";

import authReducer, {
  hydrateAuthState,
  writeAuthToStorage,
} from "./slices/authSlice";

const rootReducer = combineReducers({
  auth: authReducer,
  [medicaApi.reducerPath]: medicaApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** Persists `{ token, user }` when the auth subtree changes (`localStorage` on browser). */
const authPersistMiddleware =
  (): Middleware<Record<string, never>, RootState> =>
  (api) =>
  (next) =>
  (action) => {
    const prev = api.getState().auth;
    const result = next(action);
    const nextAuth = api.getState().auth;
    const changed =
      prev.token !== nextAuth.token || prev.user !== nextAuth.user;
    if (typeof window !== "undefined" && changed) {
      writeAuthToStorage(nextAuth);
    }
    return result;
  };

/** Each call creates a fresh store instance. Hydrates auth from LS on browser only. */
export function makeStore() {
  return configureStore({
    reducer: rootReducer,
    preloadedState:
      typeof window !== "undefined"
        ? { auth: hydrateAuthState() }
        : undefined,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .concat(medicaApi.middleware)
        .concat(authPersistMiddleware())
        .concat(mutationToastMiddleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];

let clientStore: AppStore | undefined;

/** Browser singleton (StrictMode-safe). On the server uses a throwaway empty store instance. */
export function getBrowserStore(): AppStore {
  if (typeof window === "undefined") {
    return makeStore();
  }
  clientStore ??= makeStore();
  return clientStore;
}
