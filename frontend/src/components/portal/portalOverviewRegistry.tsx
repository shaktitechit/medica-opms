"use client";

import type { ComponentType } from "react";

import type { PortalKey } from "@/constants/portalNav";

import AdminOverview from "./admin/AdminOverview";
import DispatchOverview from "./dispatch/DispatchOverview";
import FinanceOverview from "./finance/FinanceOverview";
import AccountOverview from "./account/AccountOverview";
import SalesOverview from "./sales/SalesOverview";
import SuperAdminOverview from "./super_admin/SuperAdminOverview";

export const PORTAL_OVERVIEW_BY_KEY: Record<PortalKey, ComponentType> = {
  admin: AdminOverview,
  sales: SalesOverview,
  finance: FinanceOverview,
  dispatch: DispatchOverview,
  super_admin: SuperAdminOverview,
  account: AccountOverview,
};
