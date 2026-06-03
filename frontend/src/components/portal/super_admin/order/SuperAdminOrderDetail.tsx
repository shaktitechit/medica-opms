"use client";

import AdminOrderDetail from "@/components/portal/admin/order/AdminOrderDetail";

export default function SuperAdminOrderDetail({ orderId }: { orderId: string }) {
  return <AdminOrderDetail orderId={orderId} />;
}

