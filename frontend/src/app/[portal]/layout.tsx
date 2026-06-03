import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { isPortalKey } from "@/constants/portalNav";
import { PortalLayoutClient } from "./PortalLayoutClient";

type Props = {
  children: ReactNode;
  params: Promise<{ portal: string }>;
};

export default async function PortalLayout(props: Props) {
  const params = await props.params;
  if (!isPortalKey(params.portal)) notFound();

  return (
    <PortalLayoutClient portal={params.portal}>
      {props.children}
    </PortalLayoutClient>
  );
}
