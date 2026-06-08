"use client";

interface PartyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFetching: boolean;
  isError: boolean;
  partyData: any;
  custLabel: string;
}

function displayText(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function formatStructuredAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "—";
  const a = addr as Record<string, unknown>;
  const parts: string[] = [];
  if (a.address_line_1) parts.push(String(a.address_line_1).trim());
  if (a.address_line_2) parts.push(String(a.address_line_2).trim());
  const cityLine = [a.city, a.state, a.pincode]
    .map((x) => (x ? String(x).trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (cityLine) parts.push(cityLine);
  if (a.country && String(a.country).trim() !== "India") {
    parts.push(String(a.country).trim());
  }
  return parts.length ? parts.join("\n") : "—";
}

export default function PartyDetailsModal({
  isOpen,
  onClose,
  isFetching,
  isError,
  partyData,
  custLabel,
}: PartyDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[85vh] flex flex-col font-sans">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-550 dark:text-slate-50">
            Party Details
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
          {isFetching ? (
            <p className="text-xs text-slate-505 text-slate-500">
              Loading party details...
            </p>
          ) : isError ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Error loading party details.
            </p>
          ) : partyData ? (
            (() => {
              const p = partyData as Record<string, unknown>;
              return (
                <div className="space-y-3 text-xs">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">Party Name</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {displayText(p.party_name) !== "—" ? displayText(p.party_name) : custLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">Contact</dt>
                      <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                        {displayText(p.contact_person)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">Mobile</dt>
                      <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                        {displayText(p.mobile)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">Email</dt>
                      <dd className="mt-0.5 truncate text-slate-900 dark:text-slate-100">
                        {displayText(p.email)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">GST Number</dt>
                      <dd className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
                        {displayText(p.gst_no)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">Payment Terms</dt>
                      <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                        {displayText(p.payment_terms)}
                      </dd>
                    </div>
                  </dl>
                  <div className="grid gap-3 border-t border-slate-100 pt-3 dark:border-white/10 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">Billing Address</dt>
                      <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-955/40 dark:text-slate-300">
                        {formatStructuredAddress(p.billing_address)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-505 text-slate-500">Shipping Address</dt>
                      <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-955/40 dark:text-slate-300">
                        {formatStructuredAddress(p.shipping_address)}
                      </dd>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-xs text-slate-505 text-slate-500">
              No party linked on this order.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
