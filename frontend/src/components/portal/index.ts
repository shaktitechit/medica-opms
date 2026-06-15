export {
  PortalAuthGate,
  PortalSectionPlaceholder,
} from "./shared/PortalAuthGate";

export { PortalFullScreenLoader } from "./shared/PortalFullScreenLoader";
export { PortalBusyOverlay, usePortalBusy } from "./shared/PortalBusyOverlay";
export { PortalMutationOverlay } from "./shared/PortalMutationOverlay";

export { default as PortalOverview } from "./PortalOverview";

export { PORTAL_OVERVIEW_BY_KEY } from "./portalOverviewRegistry";

export { default as AdminOverview } from "./admin/AdminOverview";
export { default as ListAdminOrdersPage } from "./admin/order/ListAdminOrdersPage";
export { default as AdminCreateOrderPage } from "./admin/AdminCreateOrderPage";
export { default as ListPartiesPage } from "./shared/ListPartiesPage";
export { default as ListProductsPage } from "./shared/ListProductsPage";
export { default as PartyDetailPage } from "./shared/PartyDetailPage";
export { default as ProductDetailPage } from "./shared/ProductDetailPage";
export { default as SalesOverview } from "./sales/SalesOverview";
export { default as SalesCreateOrderPage } from "./sales/CreateOrderPage";
export { default as ListMyOrdersPage } from "./sales/ListMyOrdersPage";

export { default as FinanceOverview } from "./finance/FinanceOverview";
export { default as ListFinanceOrdersPage } from "./finance/order/ListFinanceOrdersPage";

export { default as AccountOverview } from "./account/AccountOverview";
export { default as ListAccountOrdersPage } from "./account/order/ListAccountOrdersPage";
export { default as AccountOrderDetail } from "./account/order/AccountOrderDetail";

export { default as DispatchOverview } from "./dispatch/DispatchOverview";
export { default as ListDispatchOrdersPage } from "./dispatch/order/ListDispatchOrdersPage";
export { default as ListDriversPage } from "./dispatch/ListDriversPage";
export { default as ListVehiclesPage } from "./dispatch/ListVehiclesPage";
export { default as DriverDetailPage } from "./dispatch/DriverDetailPage";
export { default as VehicleDetailPage } from "./dispatch/VehicleDetailPage";
export { default as ListTransportAgentsPage } from "./dispatch/ListTransportAgentsPage";
export { default as TransportAgentDetailPage } from "./dispatch/TransportAgentDetailPage";

// Super Admin portal pages
export { default as SuperAdminOverview } from "./super_admin/SuperAdminOverview";
export { default as SuperAdminOrdersPage } from "./super_admin/SuperAdminOrdersPage";
export { default as SuperAdminUsersPage } from "./super_admin/SuperAdminUsersPage";
export { default as ListSuperAdminOrdersPage } from "./super_admin/order/ListSuperAdminOrdersPage";
export { default as SuperAdminOrderDetail } from "./super_admin/order/SuperAdminOrderDetail";

export { default as ProfilePage } from "./shared/ProfilePage";
export { default as PortalOverviewShell } from "./shared/PortalOverviewShell";
export { usePortalDashboardKpi } from "./shared/usePortalDashboardKpi";
export { pickOrders } from "./shared/pickOrders";

/** @deprecated Prefer importing {@link DashboardShell} from `@/components/shell`. */
export { DashboardShell, PortalShell } from "@/components/shell";
