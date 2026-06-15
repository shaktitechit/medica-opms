"use client";

import { useParams } from "next/navigation";
import { isPortalKey } from "@/constants/portalNav";
import { notFound } from "next/navigation";

import SalesOrderDetail from "@/components/portal/sales/order/SalesOrderDetail";
import AdminOrderDetail from "@/components/portal/admin/order/AdminOrderDetail";
import FinanceOrderDetail from "@/components/portal/finance/order/FinanceOrderDetail";
import AccountOrderDetail from "@/components/portal/account/order/AccountOrderDetail";
import DispatchOrderDetail from "@/components/portal/dispatch/order/DispatchOrderDetail";
import SuperAdminOrderDetail from "@/components/portal/super_admin/order/SuperAdminOrderDetail";

export default function OrderRoutingPage() {
  const params = useParams();
  const portal = typeof params.portal === "string" ? params.portal : "";
  const orderId = typeof params.order_id === "string" ? params.order_id : "";

  if (!isPortalKey(portal) || !orderId) {
    notFound();
  }

  switch (portal) {
    case "sales":
      return <SalesOrderDetail orderId={orderId} />;
    case "admin":
      return <AdminOrderDetail orderId={orderId} />;
    case "finance":
      return <FinanceOrderDetail orderId={orderId} />;
    case "account":
      return <AccountOrderDetail orderId={orderId} />;
    case "dispatch":
      return <DispatchOrderDetail orderId={orderId} />;
    case "super_admin":
      return <SuperAdminOrderDetail orderId={orderId} />;
    default:
      notFound();
  }
}
