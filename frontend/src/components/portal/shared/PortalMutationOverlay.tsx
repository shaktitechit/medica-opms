"use client";

import { PortalBusyOverlay } from "./PortalBusyOverlay";
import { messageForMutationEndpoint } from "./portalLoaderMessages";
import { useMedicaApiMutationPending } from "./useMedicaApiMutationPending";

/** Global overlay for all in-flight RTK Query mutations inside the portal shell. */
export function PortalMutationOverlay() {
  const { isPending, count, primaryEndpoint } = useMedicaApiMutationPending();
  const message = messageForMutationEndpoint(primaryEndpoint);
  const subMessage =
    count > 1 ? `${count} operations in progress` : "Please wait a moment";

  return (
    <PortalBusyOverlay
      active={isPending}
      message={message}
      subMessage={subMessage}
      delayMs={120}
    />
  );
}
