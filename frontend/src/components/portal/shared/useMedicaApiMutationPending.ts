"use client";

import { useMemo } from "react";

import { medicaApi } from "@/store/api/baseApi";
import { useAppSelector } from "@/store/hooks";

type PendingMutation = {
  endpointName?: string;
  status?: string;
};

export function useMedicaApiMutationPending() {
  const mutations = useAppSelector(
    (state) =>
      (state[medicaApi.reducerPath as keyof typeof state] as { mutations?: Record<string, PendingMutation> })
        ?.mutations ?? {},
  );

  return useMemo(() => {
    const pending = Object.values(mutations).filter((m) => m?.status === "pending");
    return {
      isPending: pending.length > 0,
      count: pending.length,
      primaryEndpoint: pending[0]?.endpointName ?? null,
    };
  }, [mutations]);
}
