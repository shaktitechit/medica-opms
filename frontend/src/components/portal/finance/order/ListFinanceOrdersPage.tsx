"use client";

import ListOrdersPage from "@/components/portal/shared/orderList/ListOrdersPage";
import { FINANCE_LIST_ORDERS_CONFIG } from "@/components/portal/shared/orderList/listOrdersPageConfig";

export default function ListFinanceOrdersPage() {
  return <ListOrdersPage config={FINANCE_LIST_ORDERS_CONFIG} />;
}
