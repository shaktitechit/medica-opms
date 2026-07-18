"use client";

import { OrderDepartmentFulfillmentPanel } from "@/components/portal/shared/OrderDepartmentFulfillmentPanel";
import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelClass } from "@/components/portal/shared/modalLayout";

type ItemFulfillmentDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  order: Record<string, unknown> | null;
  fulfillmentSnapshot?: Record<string, unknown> | null;
  returns?: Record<string, unknown>[];
  dispatches?: Record<string, unknown>[];
};

/** Shared large modal for per-line item fulfillment quantities across portals. */
export function ItemFulfillmentDetailsModal({
  isOpen,
  onClose,
  order,
  fulfillmentSnapshot,
  returns,
  dispatches,
}: ItemFulfillmentDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <LargeModalBackdrop>
      <div className={`${largeModalPanelClass} p-5 sm:p-6`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 sm:text-xl">
            Item Fulfillment Details
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-white/5"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <OrderDepartmentFulfillmentPanel
            order={order}
            fulfillmentSnapshot={fulfillmentSnapshot}
            returns={returns}
            dispatches={dispatches}
            showDepartmentBoxes={false}
            showItemsTable={true}
          />
        </div>

        <div className="mt-5 flex shrink-0 justify-end border-t border-slate-100 pt-3 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </LargeModalBackdrop>
  );
}
