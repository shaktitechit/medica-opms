import type { Middleware } from "@reduxjs/toolkit";

import { medicaApi } from "./api/baseApi";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "../lib/mutationMessages";
import { toast } from "../lib/toast";

const RP = medicaApi.reducerPath;

/** Mutations that should not show a success toast (handled locally or too noisy). */
const SKIP_SUCCESS = new Set(["login", "markNotificationRead"]);

/** Mutations that should not show the global error toast (handled in UI). */
const SKIP_ERROR = new Set(["login", "markNotificationRead"]);

function endpointNameFromAction(action: {
  meta?: { arg?: { endpointName?: string } };
}): string | undefined {
  return action.meta?.arg?.endpointName;
}

/**
 * Surfaces RTK Query mutation outcomes with sonner toasts (success + error).
 * Login is excluded — the login form handles errors; success redirects quickly.
 */
export const mutationToastMiddleware: Middleware =
  () => (next) => (action) => {
    const result = next(action);
    const t = String((action as { type?: string }).type ?? "");
    if (!t.includes(`${RP}/executeMutation/`)) return result;

    const name = endpointNameFromAction(
      action as { meta?: { arg?: { endpointName?: string } } },
    );
    if (!name) return result;

    if (t.endsWith("/fulfilled")) {
      if (!SKIP_SUCCESS.has(name)) {
        toast.success(mutationSuccessCopy(name));
      }
    } else if (t.endsWith("/rejected")) {
      if (!SKIP_ERROR.has(name)) {
        const payload = (action as { payload?: unknown }).payload;
        toast.error(mutationRejectedMessage(payload));
      }
    }

    return result;
  };
