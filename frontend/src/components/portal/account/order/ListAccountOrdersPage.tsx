"use client";

import ListOrdersPage from "@/components/portal/shared/orderList/ListOrdersPage";
import { ACCOUNT_LIST_ORDERS_CONFIG } from "@/components/portal/shared/orderList/listOrdersPageConfig";

export default function ListAccountOrdersPage() {
  return <ListOrdersPage config={ACCOUNT_LIST_ORDERS_CONFIG} />;
}
