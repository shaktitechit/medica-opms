"use client";

import { useMemo } from "react";
import { useListFlagsQuery, useListUsersQuery } from "@/store/api";
import { OrderDepartmentFlagsTab } from "@/components/portal/shared/OrderDepartmentFlagsTab";

type FlagsTabProps = {
  orderId: string;
  refetchOrder: () => void;
};

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function FlagsTab({ orderId, refetchOrder }: FlagsTabProps) {
  const flagsQ = useListFlagsQuery({ order: orderId });
  const rawFlags = useMemo(() => pickList(flagsQ.data), [flagsQ.data]);

  const usersQ = useListUsersQuery({});
  const users = useMemo(() => pickList(usersQ.data), [usersQ.data]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.username || u.name || id);
    }
    return map;
  }, [users]);

  return (
    <OrderDepartmentFlagsTab
      orderId={orderId}
      flagsQ={flagsQ}
      rawFlags={rawFlags}
      formatDate={formatDate}
      userNameById={userNameById}
      currentDepartment="sales"
      refetchOrder={refetchOrder}
    />
  );
}
