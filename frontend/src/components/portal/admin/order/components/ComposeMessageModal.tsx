"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Mail, MessageCircle, Send, X } from "lucide-react";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";
import { contactsFromParty } from "@/lib/partyContacts";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useGetOrderQuery,
  useGetPartyQuery,
  useGetUserQuery,
  useSendMessageMutation,
  useSendOrderReceivedMessageMutation,
  type MessageChannel,
} from "@/store/api";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

type SelectableContact = {
  id: string;
  source: "party" | "sales";
  name: string;
  subtitle: string;
  phone: string;
  email: string;
};

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object") {
    const o = ref as Record<string, unknown>;
    if (o._id != null) return String(o._id).trim();
    if (o.id != null) return String(o.id).trim();
  }
  return "";
}

function userFields(raw: unknown): { name: string; phone: string; email: string } {
  if (!raw || typeof raw !== "object") {
    return { name: "", phone: "", email: "" };
  }
  const o = raw as Record<string, unknown>;
  return {
    name: String(o.name || o.username || "").trim(),
    phone: String(o.phone || o.mobile || "").trim(),
    email: String(o.email || "").trim(),
  };
}

/** Matches Meta template {{3}}: "Product Name × qty" per line */
function buildItemsSummary(order: Record<string, unknown> | null): string {
  const items = Array.isArray(order?.order_items) ? order.order_items : [];
  if (!items.length) return "No items";
  return items
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      const name = String(item.product_name || "Item").trim();
      const qty = Number(item.ordered_quantity ?? item.quantity ?? 0);
      return `${name} × ${Number.isFinite(qty) ? qty : 0}`;
    })
    .join("\n");
}

function buildOrderReceivedPreview(contactName: string, orderNo: string, items: string): string {
  return [
    `Hello ${contactName || "Sir/Madam"},`,
    "",
    "Thank you for your order! We have received your order.",
    "",
    `📦 Order No: ${orderNo || "—"}`,
    "",
    "🛒 Ordered Items:",
    items || "No items",
    "",
    "We are reviewing your order and will notify you once it has been confirmed.",
    "",
    "If you have any questions, please reply to this message.",
    "",
    "Thank you for choosing Medica!",
  ].join("\n");
}

export type ComposeMessageModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNo?: string;
  partyLabel?: string;
  partyMobile?: string;
  partyEmail?: string;
  onSent?: () => void;
};

export function ComposeMessageModal({
  open,
  onClose,
  orderId,
  orderNo,
  partyLabel,
  onSent,
}: ComposeMessageModalProps) {
  const [formChannel, setFormChannel] = useState<MessageChannel>("whatsapp");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formSubject, setFormSubject] = useState(
    orderNo ? `Order ${orderNo}` : "",
  );
  const [formBody, setFormBody] = useState("");

  const orderQ = useGetOrderQuery(orderId, { skip: !open || !orderId });
  const order = useMemo(() => {
    const raw = orderQ.data;
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  }, [orderQ.data]);

  const partyId = useMemo(() => idFromRef(order?.party), [order?.party]);
  const salesUserId = useMemo(
    () => idFromRef(order?.assigned_sales_user),
    [order?.assigned_sales_user],
  );

  const partyQ = useGetPartyQuery(partyId, { skip: !open || !partyId });
  const salesUserQ = useGetUserQuery(salesUserId, {
    skip: !open || !salesUserId,
  });

  const selectableContacts = useMemo((): SelectableContact[] => {
    const rows: SelectableContact[] = [];

    const partyContacts = contactsFromParty(partyQ.data);
    partyContacts.forEach((c, index) => {
      const phone = c.phone.trim();
      const alt = c.alternate_phone.trim();
      const email = c.email.trim();
      const name = c.name.trim() || "Party contact";
      const dept = c.department.trim();

      if (phone || email) {
        rows.push({
          id: `party-${index}-primary`,
          source: "party",
          name,
          subtitle: dept ? `Party · ${dept}` : "Party contact",
          phone,
          email,
        });
      }
      if (alt && alt !== phone) {
        rows.push({
          id: `party-${index}-alt`,
          source: "party",
          name,
          subtitle: dept ? `Party · ${dept} · Alt phone` : "Party · Alt phone",
          phone: alt,
          email: "",
        });
      }
    });

    const populatedSales = userFields(order?.assigned_sales_user);
    const fetchedSales = userFields(salesUserQ.data);
    const sales = {
      name: populatedSales.name || fetchedSales.name || "Sales user",
      phone: populatedSales.phone || fetchedSales.phone,
      email: populatedSales.email || fetchedSales.email,
    };
    if (salesUserId && (sales.phone || sales.email)) {
      rows.push({
        id: `sales-${salesUserId}`,
        source: "sales",
        name: sales.name,
        subtitle: "Sales user",
        phone: sales.phone,
        email: sales.email,
      });
    }

    return rows;
  }, [partyQ.data, order?.assigned_sales_user, salesUserQ.data, salesUserId]);

  const channelContacts = useMemo(() => {
    return selectableContacts.filter((c) =>
      formChannel === "whatsapp" ? Boolean(c.phone) : Boolean(c.email),
    );
  }, [selectableContacts, formChannel]);

  const selectedContacts = useMemo(
    () => channelContacts.filter((c) => selectedIds.includes(c.id)),
    [channelContacts, selectedIds],
  );

  const resolvedOrderNo = String(order?.order_no ?? orderNo ?? "").trim();
  const itemsSummary = useMemo(() => buildItemsSummary(order), [order]);
  const previewName =
    selectedContacts[0]?.name.trim() ||
    partyLabel?.trim() ||
    "Sir/Madam";
  const whatsappPreview = useMemo(
    () => buildOrderReceivedPreview(previewName, resolvedOrderNo, itemsSummary),
    [previewName, resolvedOrderNo, itemsSummary],
  );

  const [sendMessage, { isLoading: isSendingFreeform }] = useSendMessageMutation();
  const [sendOrderReceived, { isLoading: isSendingOrderReceived }] =
    useSendOrderReceivedMessageMutation();
  const isSending = isSendingFreeform || isSendingOrderReceived;

  const channelContactKey = channelContacts.map((c) => c.id).join("|");

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      return;
    }
    setFormChannel("whatsapp");
    setFormSubject(orderNo ? `Order ${orderNo}` : "");
    setFormBody("");
  }, [open, orderNo]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds((prev) => {
      const valid = prev.filter((id) =>
        channelContacts.some((c) => c.id === id),
      );
      if (valid.length) return valid;
      const firstParty = channelContacts.find((c) => c.source === "party");
      if (firstParty) return [firstParty.id];
      return channelContacts[0] ? [channelContacts[0].id] : [];
    });
    // channelContactKey captures available ids for this channel
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional sync on open/channel/contact set
  }, [open, formChannel, channelContactKey]);

  useEffect(() => {
    if (!open || !resolvedOrderNo) return;
    setFormSubject((prev) => (prev.trim() ? prev : `Order ${resolvedOrderNo}`));
  }, [open, resolvedOrderNo]);

  const toggleContact = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllChannel = () => {
    setSelectedIds(channelContacts.map((c) => c.id));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleClose = () => {
    if (isSending) return;
    onClose();
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedContacts.length) {
      toast.error(
        formChannel === "whatsapp"
          ? "Select at least one contact with a phone number"
          : "Select at least one contact with an email",
      );
      return;
    }

    try {
      if (formChannel === "whatsapp") {
        if (!orderId) {
          toast.error("Order is required");
          return;
        }
        const recipients = selectedContacts.map((c) => c.phone);
        const names = selectedContacts.map((c) => c.name.trim() || "Sir/Madam");
        await sendOrderReceived({
          order: orderId,
          recipient: recipients,
          contact_name: names,
          order_no: resolvedOrderNo || undefined,
          items_summary: itemsSummary,
        }).unwrap();
        toast.success(
          recipients.length === 1
            ? "Message queued successfully"
            : `${recipients.length} messages queued successfully`,
        );
      } else {
        if (!formSubject.trim() && !formBody.trim()) {
          toast.error("Subject or body is required for email");
          return;
        }
        for (const contact of selectedContacts) {
          await sendMessage({
            order: orderId,
            recipient: contact.email,
            channel: "email",
            subject: formSubject.trim() || undefined,
            body: formBody.trim() || undefined,
          }).unwrap();
        }
        toast.success(
          selectedContacts.length === 1
            ? "Message queued successfully"
            : `${selectedContacts.length} emails queued successfully`,
        );
      }
      onClose();
      onSent?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  if (!open) return null;

  const contactsLoading =
    Boolean(partyId && partyQ.isFetching) ||
    Boolean(salesUserId && salesUserQ.isFetching);

  return (
    <LargeModalPortal>
      <div className={largeModalBackdropClass}>
        <div className={`${largeModalPanelClass} max-w-2xl h-[min(92vh,820px)]`}>
          <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Compose message
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {resolvedOrderNo ? `Order ${resolvedOrderNo}` : "This order"}
                {partyLabel ? ` — ${partyLabel}` : ""}
                {formChannel === "whatsapp"
                  ? ". Send WhatsApp order-received template."
                  : ". Queue outbound email."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSending}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => void handleSend(e)}
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Channel
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "whatsapp" as const, label: "WhatsApp", Icon: MessageCircle },
                      { id: "email" as const, label: "Email", Icon: Mail },
                    ] as const
                  ).map(({ id, label, Icon }) => {
                    const active = formChannel === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={isSending}
                        onClick={() => setFormChannel(id)}
                        className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                          active
                            ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-white/5"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Recipients
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      disabled={isSending || channelContacts.length === 0}
                      onClick={selectAllChannel}
                      className="font-semibold text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400 cursor-pointer"
                    >
                      Select all
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <button
                      type="button"
                      disabled={isSending || selectedIds.length === 0}
                      onClick={clearSelection}
                      className="font-semibold text-slate-500 hover:underline disabled:opacity-40 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Party contacts and the order&apos;s sales user. Select one or more.
                  {selectedContacts.length > 0
                    ? ` · ${selectedContacts.length} selected`
                    : ""}
                </p>

                {contactsLoading && channelContacts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-white/10">
                    Loading contacts…
                  </p>
                ) : channelContacts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-white/10">
                    {formChannel === "whatsapp"
                      ? "No phone numbers found on party contacts or sales user."
                      : "No email addresses found on party contacts or sales user."}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {channelContacts.map((contact) => {
                      const checked = selectedIds.includes(contact.id);
                      const value =
                        formChannel === "whatsapp" ? contact.phone : contact.email;
                      return (
                        <label
                          key={contact.id}
                          className={`flex items-start gap-2.5 rounded-lg border p-2.5 transition cursor-pointer ${
                            checked
                              ? "border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/30"
                              : "border-slate-200 hover:bg-slate-50/80 dark:border-white/10 dark:hover:bg-white/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isSending}
                            checked={checked}
                            onChange={() => toggleContact(contact.id)}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1 text-xs">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                                {contact.name}
                              </p>
                              <span
                                className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                  contact.source === "sales"
                                    ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                                    : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                                }`}
                              >
                                {contact.source === "sales" ? "Sales" : "Party"}
                              </span>
                            </div>
                            <p className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              {contact.subtitle}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-400">
                              {value}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {formChannel === "whatsapp" ? (
                <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-slate-950/50">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Order received template preview
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {"{{1}} name · {{2}} order no · {{3}} items"}
                    {selectedContacts.length > 1
                      ? ` · each of ${selectedContacts.length} recipients gets their own name`
                      : null}
                  </p>
                  {orderQ.isFetching && !order ? (
                    <p className="mt-2 text-xs text-slate-500">Loading order…</p>
                  ) : orderQ.isError ? (
                    <p className="mt-2 text-xs text-rose-600">
                      Failed to load order details. You can still send; the server will load the order.
                    </p>
                  ) : (
                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {whatsappPreview}
                    </pre>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label htmlFor="comm-subject" className={labelClass}>
                      Subject
                    </label>
                    <input
                      id="comm-subject"
                      type="text"
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      disabled={isSending}
                      placeholder="Email subject"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="comm-body" className={labelClass}>
                      Body
                    </label>
                    <textarea
                      id="comm-body"
                      value={formBody}
                      onChange={(e) => setFormBody(e.target.value)}
                      disabled={isSending}
                      rows={6}
                      placeholder="Message content…"
                      className={`${inputClass} resize-none`}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-white/5 dark:bg-slate-950/40">
              <button
                type="button"
                disabled={isSending}
                onClick={handleClose}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSending ||
                  selectedContacts.length === 0 ||
                  (formChannel === "whatsapp" && orderQ.isFetching && !order)
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 cursor-pointer"
              >
                <Send className="h-4 w-4" />
                {isSending
                  ? "Queuing…"
                  : formChannel === "whatsapp"
                    ? selectedContacts.length > 1
                      ? `Send to ${selectedContacts.length}`
                      : "Send order received"
                    : selectedContacts.length > 1
                      ? `Send ${selectedContacts.length} emails`
                      : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </LargeModalPortal>
  );
}
