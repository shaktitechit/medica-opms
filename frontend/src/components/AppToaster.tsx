"use client";

import { Toaster } from "sonner";
import { useIsDark } from "@/hooks/useTheme";

export function AppToaster() {
  const dark = useIsDark();

  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={4200}
      theme={dark ? "dark" : "light"}
    />
  );
}

