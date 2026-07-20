"use client";

import { useParams } from "next/navigation";

import {
  PortalOverview,
  PortalSectionPlaceholder,
  ListMyOrdersPage,
  ListWorkPlansPage,
  WorkPlanFormPage,
  WorkPlanDetailPage,
  WorkPlanCalendarPage,
  ListTransportPlansPage,
  TransportPlanFormPage,
  TransportPlanDetailPage,
  TransportPlanCalendarPage,
  ListPartiesPage,
  ListProductsPage,
  PartyDetailPage,
  ProductDetailPage,
  ListAdminOrdersPage,
  AdminCreateOrderPage,
  ListFinanceOrdersPage,
  FinanceCreateOrderPage,
  ListAccountOrdersPage,
  AccountCreateOrderPage,
  ListDispatchOrdersPage,
  ListDriversPage,
  ListVehiclesPage,
  DriverDetailPage,
  VehicleDetailPage,
  ListTransportAgentsPage,
  TransportAgentDetailPage,
  SuperAdminOrdersPage,
  ListSuperAdminOrdersPage,
  SuperAdminUsersPage,
  SuperAdminOrderDetail,
  ProfilePage,
} from "@/components/portal";
import CreateOrderPage from "@/components/portal/sales/CreateOrderPage";
import {
  type PortalKey,
  isPortalKey,
  resolvePortalPageTitle,
} from "@/constants/portalNav";

export default function PortalCatchAllPage() {
  const params = useParams();

  const raw =
    typeof params.portal === "string"
      ? params.portal
      : Array.isArray(params.portal)
        ? params.portal[0]
        : "";
  const portal: PortalKey = isPortalKey(raw) ? raw : "admin";

  const restRaw = params.rest;
  const restArr: string[] = Array.isArray(restRaw)
    ? restRaw
    : typeof restRaw === "string"
      ? [restRaw]
      : [];

  const title = resolvePortalPageTitle(portal, restArr);

  if (restArr.length === 0) {
    return <PortalOverview portal={portal} />;
  }

  // ── ADMIN ────────────────────────────────────────────────────────────────
  if (portal === "admin" && restArr.length === 1 && restArr[0] === "orders") {
    return <ListAdminOrdersPage />;
  }
  if (portal === "admin" && restArr.length === 1 && restArr[0] === "create-order") {
    return <AdminCreateOrderPage />;
  }
  if (portal === "admin" && restArr.length === 1 && restArr[0] === "work-planner") {
    return <ListWorkPlansPage portalHome="/admin" />;
  }
  if (portal === "admin" && restArr.length === 2 && restArr[0] === "work-planner" && restArr[1] === "calendar") {
    return <WorkPlanCalendarPage portalHome="/admin" />;
  }
  if (portal === "admin" && restArr.length === 2 && restArr[0] === "work-planner" && restArr[1] === "new") {
    return <WorkPlanFormPage mode="create" portalHome="/admin" />;
  }
  if (
    portal === "admin" &&
    restArr.length === 3 &&
    restArr[0] === "work-planner" &&
    restArr[2] === "edit"
  ) {
    return <WorkPlanFormPage mode="edit" planId={restArr[1]} portalHome="/admin" />;
  }
  if (portal === "admin" && restArr.length === 2 && restArr[0] === "work-planner") {
    return <WorkPlanDetailPage planId={restArr[1]} portalHome="/admin" />;
  }
  if (portal === "admin" && restArr.length === 1 && restArr[0] === "parties") {
    return <ListPartiesPage portalHome="/admin" />;
  }
  if (portal === "admin" && restArr.length === 1 && restArr[0] === "products") {
    return <ListProductsPage portalHome="/admin" />;
  }
  if (portal === "admin" && restArr.length === 1 && restArr[0] === "transport-agents") {
    return <ListTransportAgentsPage portalHome="/admin" />;
  }

  // ── SALES ────────────────────────────────────────────────────────────────
  if (portal === "sales" && restArr.length === 1 && restArr[0] === "create-order") {
    return <CreateOrderPage />;
  }
  if (portal === "sales" && restArr.length === 1 && restArr[0] === "orders") {
    return <ListMyOrdersPage />;
  }
  if (portal === "sales" && restArr.length === 1 && restArr[0] === "work-planner") {
    return <ListWorkPlansPage portalHome="/sales" />;
  }
  if (portal === "sales" && restArr.length === 2 && restArr[0] === "work-planner" && restArr[1] === "calendar") {
    return <WorkPlanCalendarPage portalHome="/sales" />;
  }
  if (portal === "sales" && restArr.length === 2 && restArr[0] === "work-planner" && restArr[1] === "new") {
    return <WorkPlanFormPage mode="create" portalHome="/sales" />;
  }
  if (
    portal === "sales" &&
    restArr.length === 3 &&
    restArr[0] === "work-planner" &&
    restArr[2] === "edit"
  ) {
    return <WorkPlanFormPage mode="edit" planId={restArr[1]} portalHome="/sales" />;
  }
  if (portal === "sales" && restArr.length === 2 && restArr[0] === "work-planner") {
    return <WorkPlanDetailPage planId={restArr[1]} portalHome="/sales" />;
  }

  // ── FINANCE ──────────────────────────────────────────────────────────────
  if (portal === "finance" && restArr.length === 1 && restArr[0] === "orders") {
    return <ListFinanceOrdersPage />;
  }
  if (portal === "finance" && restArr.length === 1 && restArr[0] === "create-order") {
    return <FinanceCreateOrderPage />;
  }
  if (portal === "finance" && restArr.length === 1 && restArr[0] === "parties") {
    return <ListPartiesPage portalHome="/finance" />;
  }
  if (portal === "finance" && restArr.length === 1 && restArr[0] === "products") {
    return <ListProductsPage portalHome="/finance" />;
  }
  if (portal === "finance" && restArr.length === 1 && restArr[0] === "transport-agents") {
    return <ListTransportAgentsPage portalHome="/finance" />;
  }

  // ── ACCOUNT ──────────────────────────────────────────────────────────────
  if (portal === "account" && restArr.length === 1 && restArr[0] === "orders") {
    return <ListAccountOrdersPage />;
  }
  if (portal === "account" && restArr.length === 1 && restArr[0] === "create-order") {
    return <AccountCreateOrderPage />;
  }
  if (portal === "account" && restArr.length === 1 && restArr[0] === "parties") {
    return <ListPartiesPage portalHome="/account" />;
  }
  if (portal === "account" && restArr.length === 1 && restArr[0] === "products") {
    return <ListProductsPage portalHome="/account" />;
  }
  if (portal === "account" && restArr.length === 1 && restArr[0] === "transport-agents") {
    return <ListTransportAgentsPage portalHome="/account" />;
  }
  if (portal === "account" && restArr.length === 1 && restArr[0] === "transport-planner") {
    return <ListTransportPlansPage portalHome="/account" />;
  }
  if (portal === "account" && restArr.length === 2 && restArr[0] === "transport-planner" && restArr[1] === "calendar") {
    return <TransportPlanCalendarPage portalHome="/account" />;
  }
  if (portal === "account" && restArr.length === 2 && restArr[0] === "transport-planner" && restArr[1] === "new") {
    return <TransportPlanFormPage mode="create" portalHome="/account" />;
  }
  if (
    portal === "account" &&
    restArr.length === 3 &&
    restArr[0] === "transport-planner" &&
    restArr[2] === "edit"
  ) {
    return <TransportPlanFormPage mode="edit" planId={restArr[1]} portalHome="/account" />;
  }
  if (portal === "account" && restArr.length === 2 && restArr[0] === "transport-planner") {
    return <TransportPlanDetailPage planId={restArr[1]} portalHome="/account" />;
  }

  // ── DISPATCH ─────────────────────────────────────────────────────────────
  if (portal === "dispatch" && restArr.length === 1 && restArr[0] === "orders") {
    return <ListDispatchOrdersPage />;
  }
  if (portal === "dispatch" && restArr.length === 1 && restArr[0] === "drivers") {
    return <ListDriversPage />;
  }
  if (portal === "dispatch" && restArr.length === 1 && restArr[0] === "vehicles") {
    return <ListVehiclesPage />;
  }
  if (portal === "dispatch" && restArr.length === 1 && restArr[0] === "transport-agents") {
    return <ListTransportAgentsPage />;
  }
  if (portal === "dispatch" && restArr.length === 1 && restArr[0] === "transport-planner") {
    return <ListTransportPlansPage portalHome="/dispatch" />;
  }
  if (portal === "dispatch" && restArr.length === 2 && restArr[0] === "transport-planner" && restArr[1] === "calendar") {
    return <TransportPlanCalendarPage portalHome="/dispatch" />;
  }
  if (portal === "dispatch" && restArr.length === 2 && restArr[0] === "transport-planner") {
    return <TransportPlanDetailPage planId={restArr[1]} portalHome="/dispatch" />;
  }
  if (portal === "dispatch" && restArr.length === 2 && restArr[0] === "vehicles") {
    return <VehicleDetailPage id={restArr[1]} />;
  }
  if (portal === "dispatch" && restArr.length === 2 && restArr[0] === "drivers") {
    return <DriverDetailPage id={restArr[1]} />;
  }
  if (portal === "dispatch" && restArr.length === 2 && restArr[0] === "transport-agents") {
    return <TransportAgentDetailPage id={restArr[1]} />;
  }

  // ── SUPER ADMIN ──────────────────────────────────────────────────────────
  if (portal === "super_admin" && restArr.length === 1 && restArr[0] === "orders") {
    return <ListSuperAdminOrdersPage />;
  }
  if (portal === "super_admin" && restArr.length === 2 && restArr[0] === "order") {
    return <SuperAdminOrderDetail orderId={restArr[1]} />;
  }
  if (portal === "super_admin" && restArr.length === 1 && restArr[0] === "users") {
    return <SuperAdminUsersPage />;
  }
  if (portal === "super_admin" && restArr.length === 1 && restArr[0] === "parties") {
    return <ListPartiesPage portalHome="/super_admin" />;
  }
  if (portal === "super_admin" && restArr.length === 1 && restArr[0] === "products") {
    return <ListProductsPage portalHome="/super_admin" />;
  }
  if (portal === "super_admin" && restArr.length === 2 && restArr[0] === "parties") {
    return <PartyDetailPage id={restArr[1]} portalHome="/super_admin" />;
  }
  if (portal === "super_admin" && restArr.length === 2 && restArr[0] === "products") {
    return <ProductDetailPage id={restArr[1]} portalHome="/super_admin" />;
  }

  // ── SHARED DETAIL PAGES ──────────────────────────────────────────────────
  if (
    (portal === "admin" || portal === "finance" || portal === "account" || portal === "super_admin") &&
    restArr.length === 2 && restArr[0] === "parties"
  ) {
    return <PartyDetailPage id={restArr[1]} portalHome={`/${portal}`} />;
  }
  if (
    (portal === "admin" || portal === "finance" || portal === "account" || portal === "super_admin") &&
    restArr.length === 2 && restArr[0] === "products"
  ) {
    return <ProductDetailPage id={restArr[1]} portalHome={`/${portal}`} />;
  }
  if (
    (portal === "admin" || portal === "finance" || portal === "account") &&
    restArr.length === 2 && restArr[0] === "transport-agents"
  ) {
    return <TransportAgentDetailPage id={restArr[1]} portalHome={`/${portal}`} />;
  }

  if (restArr.length === 1 && restArr[0] === "profile") {
    return <ProfilePage />;
  }

  return <PortalSectionPlaceholder portal={portal} title={title} />;
}
