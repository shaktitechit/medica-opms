"use client";

import { DashboardShell } from "@/components/shell";
import { PortalAuthGate } from "@/components/portal";
import { PortalMutationOverlay } from "@/components/portal/shared/PortalMutationOverlay";
import type { ReactNode } from "react";

type PortalLayoutClientProps = {
  portal: string;
  children: ReactNode;
};

export function PortalLayoutClient({
  portal,
  children,
}: PortalLayoutClientProps) {
  return (
    <PortalAuthGate>
      <DashboardShell portal={portal}>{children}</DashboardShell>
      <PortalMutationOverlay />
    </PortalAuthGate>
  );
}
