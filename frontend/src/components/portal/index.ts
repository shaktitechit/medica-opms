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
export { default as ListProductGroupsPage } from "./shared/ListProductGroupsPage";
export { default as ListProductSubgroupsPage } from "./shared/ListProductSubgroupsPage";
export { default as ListProductBrandsPage } from "./shared/ListProductBrandsPage";
export { default as ListProductManufacturersPage } from "./shared/ListProductManufacturersPage";
export { default as GroupProductsPage } from "./shared/GroupProductsPage";
export { default as SubgroupProductsPage } from "./shared/SubgroupProductsPage";
export { default as BrandProductsPage } from "./shared/BrandProductsPage";
export { default as ManufacturerProductsPage } from "./shared/ManufacturerProductsPage";
export { default as PartyDetailPage } from "./shared/PartyDetailPage";
export { default as ProductDetailPage } from "./shared/ProductDetailPage";
export { default as SalesOverview } from "./sales/SalesOverview";
export { default as SalesCreateOrderPage } from "./sales/CreateOrderPage";
export { default as ListMyOrdersPage } from "./sales/ListMyOrdersPage";
export { default as ListWorkPlansPage } from "./shared/workPlanner/ListWorkPlansPage";
export { default as WorkPlanFormPage } from "./shared/workPlanner/WorkPlanFormPage";
export { default as WorkPlanDetailPage } from "./shared/workPlanner/WorkPlanDetailPage";
export { default as WorkPlanCalendarPage } from "./shared/workPlanner/WorkPlanCalendarPage";
export { default as ListTransportPlansPage } from "./shared/transportPlanner/ListTransportPlansPage";
export { default as TransportPlanFormPage } from "./shared/transportPlanner/TransportPlanFormPage";
export { default as TransportPlanDetailPage } from "./shared/transportPlanner/TransportPlanDetailPage";
export { default as TransportPlanCalendarPage } from "./shared/transportPlanner/TransportPlanCalendarPage";
export { default as TransportPlannerStatsWidgets } from "./shared/transportPlanner/TransportPlannerStatsWidgets";

export { default as FinanceOverview } from "./finance/FinanceOverview";
export { default as ListFinanceOrdersPage } from "./finance/order/ListFinanceOrdersPage";
export { default as FinanceCreateOrderPage } from "./finance/FinanceCreateOrderPage";

export { default as AccountOverview } from "./account/AccountOverview";
export { default as ListAccountOrdersPage } from "./account/order/ListAccountOrdersPage";
export { default as AccountOrderDetail } from "./account/order/AccountOrderDetail";
export { default as AccountCreateOrderPage } from "./account/AccountCreateOrderPage";

export { default as DispatchOverview } from "./dispatch/DispatchOverview";
export { default as ListDispatchOrdersPage } from "./dispatch/order/ListDispatchOrdersPage";
export { default as ListDriversPage } from "./shared/ListDriversPage";
export { default as ListVehiclesPage } from "./shared/ListVehiclesPage";
export { default as DriverDetailPage } from "./shared/DriverDetailPage";
export { default as VehicleDetailPage } from "./shared/VehicleDetailPage";
export { default as ListTransportAgentsPage } from "./shared/ListTransportAgentsPage";
export { default as TransportAgentDetailPage } from "./shared/TransportAgentDetailPage";

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
