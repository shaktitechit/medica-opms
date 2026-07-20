import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import { publicApiOrigin } from "@/lib/env";

/** Swagger / `app.js` domain tags → cache invalidation buckets. */
export const medicaApi = createApi({
  reducerPath: "medicaApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${publicApiOrigin()}/api`,
    prepareHeaders(headers, api) {
      const state = api.getState() as { auth?: { token?: string | null } };
      const token = state.auth?.token;
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: [
    "AuthSession",
    "Activity",
    "Approvals",
    "Attachments",
    "Collections",
    "Parties",
    "PartyProducts",
    "Dashboard",
    "Dispatch",
    "Drivers",
    "FinanceQueue",
    "FinanceSummary",
    "Flags",
    "Invoices",
    "Notifications",
    "Messages",
    "Order",
    "Orders",
    "OrderApprovals",
    "Payments",
    "Reminders",
    "WorkPlans",
    "TransportPlans",
    "Products",
    "ProductGroups",
    "ProductSubgroups",
    "ProductBrands",
    "ProductManufacturers",
    "Transport",
    "TransportAgents",
    "Users",
    "Vehicles",
  ],
  endpoints: () => ({}),
});

export type MedicaApi = typeof medicaApi;
