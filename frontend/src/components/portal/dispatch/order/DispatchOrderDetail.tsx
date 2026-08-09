"use client";

import OrderDetailsPage from "@/components/portal/shared/orderDetail/OrderDetailsPage";
import { DISPATCH_ORDER_DETAILS_CONFIG } from "@/components/portal/shared/orderDetail/orderDetailsPageConfig";

export default function DispatchOrderDetail({ orderId }: { orderId: string }) {
  return (
    <OrderDetailsPage orderId={orderId} config={DISPATCH_ORDER_DETAILS_CONFIG} />
  );
}
