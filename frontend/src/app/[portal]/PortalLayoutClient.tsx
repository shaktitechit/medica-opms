"use client";

import { DashboardShell } from "@/components/shell";
import { PortalAuthGate } from "@/components/portal";
import { AccountTabAlertProvider } from "@/components/portal/account/AccountTabAlert";
import { AdminTabAlertProvider } from "@/components/portal/admin/AdminTabAlert";
import { DispatchTabAlertProvider } from "@/components/portal/dispatch/DispatchTabAlert";
import { FinanceTabAlertProvider } from "@/components/portal/finance/FinanceTabAlert";
import { PortalMutationOverlay } from "@/components/portal/shared/PortalMutationOverlay";
import type { ReactNode } from "react";

type PortalLayoutClientProps = {
  portal: string;
  children: ReactNode;
};

function wrapPortalTabAlert(portal: string, children: ReactNode) {
  if (portal === "account") {
    return <AccountTabAlertProvider>{children}</AccountTabAlertProvider>;
  }
  if (portal === "admin") {
    return <AdminTabAlertProvider>{children}</AdminTabAlertProvider>;
  }
  if (portal === "finance") {
    return <FinanceTabAlertProvider>{children}</FinanceTabAlertProvider>;
  }
  if (portal === "dispatch") {
    return <DispatchTabAlertProvider>{children}</DispatchTabAlertProvider>;
  }
  return children;
}

export function PortalLayoutClient({
  portal,
  children,
}: PortalLayoutClientProps) {
  const shell = <DashboardShell portal={portal}>{children}</DashboardShell>;

  return (
    <PortalAuthGate>
      {wrapPortalTabAlert(portal, shell)}
      <PortalMutationOverlay />
    </PortalAuthGate>
  );
}
