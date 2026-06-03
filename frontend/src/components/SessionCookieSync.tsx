"use client";

import { useEffect } from "react";

import { persistSessionMarksFromAuth } from "@/lib/sessionCookie";
import { useAppSelector } from "@/store";

/** Keeps dept/session sentinel cookies in sync whenever Redux auth changes (login, me, hydration). */
export function SessionCookieSync() {
  const token = useAppSelector((s) => s.auth.token);
  const user = useAppSelector((s) => s.auth.user);

  useEffect(() => {
    persistSessionMarksFromAuth({ token, user });
  }, [token, user]);

  return null;
}
