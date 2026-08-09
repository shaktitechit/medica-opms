"use client";

import ListOrdersPage from "@/components/portal/shared/orderList/ListOrdersPage";
import { SUPER_ADMIN_LIST_ORDERS_CONFIG } from "@/components/portal/shared/orderList/listOrdersPageConfig";

export default function ListSuperAdminOrdersPage() {
  return <ListOrdersPage config={SUPER_ADMIN_LIST_ORDERS_CONFIG} />;
}
