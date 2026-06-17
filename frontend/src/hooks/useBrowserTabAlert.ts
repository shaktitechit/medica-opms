import { useEffect, useRef } from "react";

export type BrowserTabAlertOptions = {
  /** Number of pending items; tab badge shows when > 0. */
  count: number;
  /** Title restored when count is 0 or the hook unmounts. */
  baseTitle?: string;
  /** Shown in the alert title, e.g. "pending account approval". */
  alertLabel?: string;
  /** When false, always restores base title. */
  enabled?: boolean;
  /** When true, badge only appears while the tab is in the background. */
  onlyWhenHidden?: boolean;
};

const DEFAULT_BASE_TITLE = "Medica";

function formatAlertTitle(
  count: number,
  baseTitle: string,
  alertLabel?: string,
): string {
  if (alertLabel) {
    return `(${count}) ${alertLabel} | ${baseTitle}`;
  }
  return `(${count}) ${baseTitle}`;
}

/**
 * Updates `document.title` to surface a pending-work count in the browser tab.
 */
export function useBrowserTabAlert({
  count,
  baseTitle = DEFAULT_BASE_TITLE,
  alertLabel,
  enabled = true,
  onlyWhenHidden = false,
}: BrowserTabAlertOptions) {
  const savedTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    if (savedTitleRef.current === null) {
      const current = document.title.trim();
      savedTitleRef.current =
        current && current !== baseTitle ? current : baseTitle;
    }

    const restoreTitle = () => {
      document.title = savedTitleRef.current ?? baseTitle;
    };

    const applyTitle = () => {
      const shouldAlert =
        enabled && count > 0 && (!onlyWhenHidden || document.hidden);

      if (shouldAlert) {
        document.title = formatAlertTitle(count, baseTitle, alertLabel);
      } else {
        document.title = baseTitle;
      }
    };

    applyTitle();

    if (!onlyWhenHidden) {
      return restoreTitle;
    }

    document.addEventListener("visibilitychange", applyTitle);
    return () => {
      document.removeEventListener("visibilitychange", applyTitle);
      restoreTitle();
    };
  }, [count, baseTitle, alertLabel, enabled, onlyWhenHidden]);
}
