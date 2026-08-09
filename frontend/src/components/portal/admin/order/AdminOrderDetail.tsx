"use client";

import OrderDetailsPage from "@/components/portal/shared/orderDetail/OrderDetailsPage";
import { ADMIN_ORDER_DETAILS_CONFIG } from "@/components/portal/shared/orderDetail/orderDetailsPageConfig";

export default function AdminOrderDetail({ orderId }: { orderId: string }) {
  return (
    <OrderDetailsPage orderId={orderId} config={ADMIN_ORDER_DETAILS_CONFIG} />
  );
}
