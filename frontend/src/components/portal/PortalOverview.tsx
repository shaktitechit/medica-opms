"use client";

import type { PortalKey } from "@/constants/portalNav";
import { PORTAL_OVERVIEW_BY_KEY } from "./portalOverviewRegistry";

type PortalOverviewProps = { portal: PortalKey };

export default function PortalOverview({ portal }: PortalOverviewProps) {
  const Comp = PORTAL_OVERVIEW_BY_KEY[portal];
  return <Comp />;
}
