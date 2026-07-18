"use client";

import { useMemo, useState } from "react";
import {
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import { ComposeMessageModal } from "./ComposeMessageModal";
import {
  useListMessagesQuery,
  type MessageChannel,
  type MessageRecord,
  type MessageStatus,
} from "@/store/api";

const STATUS_OPTIONS: Array<"all" | MessageStatus> = [
  "all",
  "pending",
  "queued",
  "sending",
  "sent",
  "failed",
];

const CHANNEL_OPTIONS: Array<"all" | MessageChannel> = ["all", "email", "whatsapp"];

function formatDate(v?: string): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: string): string {
  switch (status) {
    case "sent":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "failed":
      return "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300";
    case "sending":
    case "queued":
      return "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-white/10 dark:text-slate-300";
  }
}

function rowId(row: MessageRecord): string {
  return String(row._id ?? row.id ?? "");
}

export type CommunicationTabProps = {
  orderId: string;
  orderNo?: string;
  partyLabel?: string;
  /** Prefill WhatsApp compose / optional filter hint */
  partyMobile?: string;
  /** Prefill email compose */
  partyEmail?: string;
};

export default function CommunicationTab({
  orderId,
  orderNo,
  partyLabel,
  partyMobile,
  partyEmail,
}: CommunicationTabProps) {
  const defaultWhatsapp = (partyMobile || "").trim();
  const defaultEmail = (partyEmail || "").trim();

  const [channel, setChannel] = useState<"all" | MessageChannel>("all");
  const [status, setStatus] = useState<"all" | MessageStatus>("all");
  const [recipientSearch, setRecipientSearch] = useState(defaultWhatsapp || defaultEmail);
  const [appliedRecipient, setAppliedRecipient] = useState(defaultWhatsapp || defaultEmail);
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);

  const queryArgs = useMemo(
    () => ({
      order: orderId,
      channel: channel === "all" ? undefined : channel,
      status: status === "all" ? undefined : status,
      recipient: appliedRecipient.trim() || undefined,
      page: String(page),
      limit: "20",
    }),
    [orderId, channel, status, appliedRecipient, page],
  );

  const { data, isFetching, isError, refetch } = useListMessagesQuery(queryArgs, {
    skip: !orderId,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(data?.pages ?? 1, 1);

  const handleSearch = () => {
    setPage(1);
    setAppliedRecipient(recipientSearch.trim());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            Communication
          </h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Outbound email and WhatsApp for this order
            {partyLabel ? (
              <>
                {" "}
                · <span className="font-semibold text-slate-800 dark:text-slate-200">{partyLabel}</span>
              </>
            ) : null}
            <span className="sr-only"> order {orderId}</span>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Compose
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[10rem] flex-1 space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recipient
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Phone or email…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Channel
          </label>
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value as typeof channel);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 dark:border-white/15 dark:bg-slate-950 dark:text-slate-100"
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "All channels" : opt}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 dark:border-white/15 dark:bg-slate-950 dark:text-slate-100"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "All statuses" : opt}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSearch}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer"
        >
          Apply
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/5 dark:bg-slate-950/50">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject / Body</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {isError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-rose-600">
                    Failed to load messages. Try refresh.
                  </td>
                </tr>
              ) : isFetching && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    Loading message log…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No messages match these filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const preview =
                    row.subject?.trim() ||
                    row.body?.trim() ||
                    row.templateName ||
                    "—";
                  return (
                    <tr
                      key={rowId(row) || `${row.recipient}-${row.createdAt}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold capitalize text-slate-800 dark:text-slate-200">
                          {row.channel === "email" ? (
                            <Mail className="h-3.5 w-3.5 text-sky-500" />
                          ) : (
                            <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                          {row.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-200">
                        {row.recipient}
                      </td>
                      <td className="max-w-[280px] px-4 py-3">
                        <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={preview}>
                          {preview}
                        </div>
                        {row.error ? (
                          <div className="mt-0.5 truncate text-xs text-rose-600" title={row.error}>
                            {row.error}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ring-1 ring-inset ${statusTone(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-white/5">
          <span>
            {total} message{total === 1 ? "" : "s"}
            {pages > 1 ? ` · Page ${page} of ${pages}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pages || isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <ComposeMessageModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        orderId={orderId}
        orderNo={orderNo}
        partyLabel={partyLabel}
        partyMobile={partyMobile}
        partyEmail={partyEmail}
        onSent={() => void refetch()}
      />
    </div>
  );
}
