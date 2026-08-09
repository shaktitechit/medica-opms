"use client";

import OrderDetailsPage from "@/components/portal/shared/orderDetail/OrderDetailsPage";
import { SUPER_ADMIN_ORDER_DETAILS_CONFIG } from "@/components/portal/shared/orderDetail/orderDetailsPageConfig";

export default function SuperAdminOrderDetail({ orderId }: { orderId: string }) {
  return (
    <OrderDetailsPage
      orderId={orderId}
      config={SUPER_ADMIN_ORDER_DETAILS_CONFIG}
    />
  );
}
