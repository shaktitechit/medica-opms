"use client";

import { OrderTab } from "./OrderTab";

interface OrderItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  detail: any;
  status: string;
  readOnlyItems: any[];
  refetchOrder: () => void;
}

function formatMoney(v: unknown): string {
  const n = Number(v);
  return (Number.isFinite(n) && n > 0) ? n.toFixed(2) : "—";
}

export default function OrderItemsModal({
  isOpen,
  onClose,
  detail,
  status,
  readOnlyItems,
  refetchOrder,
}: OrderItemsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-4xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5 font-sans">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-550 dark:text-slate-50">
            Order Items
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mt-4 overflow-y-auto flex-1 pr-1">
          <OrderTab
            detail={detail}
            status={status}
            formatMoney={formatMoney}
            readOnlyItems={readOnlyItems}
            refetchOrder={refetchOrder}
          />
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer font-sans"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
