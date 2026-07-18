/** Shared Tailwind classes for large portal modals (forms, approvals, previews). */
export const largeModalBackdropClass =
  "fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6 backdrop-blur-[1px]";

export const largeModalPanelClass =
  "flex h-[min(92vh,920px)] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900";

/** Same width/height as {@link largeModalPanelClass}, but scrolls the whole panel (simple forms). */
export const largeModalPanelScrollClass =
  "flex h-[min(92vh,920px)] w-full max-w-7xl flex-col overflow-y-auto rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900";
