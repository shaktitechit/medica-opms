export type PortalPresentation = {
  portalName: string;
  gradientClass: string;
  badgeClass: string;
};

export function resolvePortalPresentation(portal: string): PortalPresentation {
  if (portal === "finance") {
    return {
      portalName: "Finance Portal",
      gradientClass:
        "from-emerald-500/10 to-teal-500/10 border-emerald-500/10 dark:from-emerald-500/5 dark:to-teal-500/5",
      badgeClass:
        "bg-emerald-50 text-emerald-700 ring-emerald-700/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
    };
  }

  if (portal === "account") {
    return {
      portalName: "Account Portal",
      gradientClass:
        "from-blue-500/10 to-indigo-500/10 border-blue-500/10 dark:from-blue-500/5 dark:to-indigo-500/5",
      badgeClass:
        "bg-blue-50 text-blue-700 ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20",
    };
  }

  if (portal === "super_admin") {
    return {
      portalName: "Super Admin Portal",
      gradientClass:
        "from-violet-500/10 to-purple-500/10 border-violet-500/10 dark:from-violet-500/5 dark:to-purple-500/5",
      badgeClass:
        "bg-violet-50 text-violet-700 ring-violet-700/10 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20",
    };
  }

  return {
    portalName: "Admin Portal",
    gradientClass:
      "from-violet-500/10 to-purple-500/10 border-violet-500/10 dark:from-violet-500/5 dark:to-purple-500/5",
    badgeClass:
      "bg-violet-50 text-violet-700 ring-violet-700/10 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20",
  };
}
