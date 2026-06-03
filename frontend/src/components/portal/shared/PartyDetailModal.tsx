"use client";

import { useCallback, useEffect, useState } from "react";

import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreatePartyMutation,
  useGetPartyQuery,
  usePatchPartyMutation,
} from "@/store/api";

export type PartyDetailModalProps = {
  partyId: string | null;
  create?: boolean;
  onClose: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

const PARTY_TYPE_OPTIONS = ["customer", "supplier", "both"] as const;

function stringField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function valsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    (a === null || a === undefined || a === "") &&
    (b === null || b === undefined || b === "")
  )
    return true;
  return false;
}

type PartyState = {
  party_name: string;
  party_type: "customer" | "supplier" | "both";
  contact_person: string;
  mobile: string;
  email: string;
  gst_no: string;
  drug_license_no: string;
  district: string;
  state: string;
  payment_terms: string;
  is_active: boolean;
  billing_address: {
    address_line_1: string;
    address_line_2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  shipping_address: {
    address_line_1: string;
    address_line_2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
};

const defaultPartyState = (): PartyState => ({
  party_name: "",
  party_type: "customer",
  contact_person: "",
  mobile: "",
  email: "",
  gst_no: "",
  drug_license_no: "",
  district: "",
  state: "",
  payment_terms: "",
  is_active: true,
  billing_address: {
    address_line_1: "",
    address_line_2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  },
  shipping_address: {
    address_line_1: "",
    address_line_2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  },
});

export function PartyDetailModal({
  partyId,
  create = false,
  onClose,
}: PartyDetailModalProps) {
  const show = create || (partyId != null && partyId !== "");
  const isEditing = partyId != null && partyId !== "";

  // Queries
  const { data: rawParty, isFetching } = useGetPartyQuery(partyId ?? "", {
    skip: !isEditing,
  });

  const [createParty, { isLoading: isCreating }] = useCreatePartyMutation();
  const [patchParty, { isLoading: isPatching }] = usePatchPartyMutation();
  const isSaving = isCreating || isPatching;

  // Local Form state
  const [form, setForm] = useState<PartyState>(defaultPartyState());
  const [activeTab, setActiveTab] = useState<"details" | "address">("details");

  // Sync loaded party into form
  useEffect(() => {
    if (rawParty && typeof rawParty === "object") {
      const p = rawParty as any;
      const bAddr = p.billing_address || {};
      const sAddr = p.shipping_address || {};

      setForm({
        party_name: stringField(p.party_name),
        party_type: PARTY_TYPE_OPTIONS.includes(p.party_type)
          ? p.party_type
          : "customer",
        contact_person: stringField(p.contact_person),
        mobile: stringField(p.mobile),
        email: stringField(p.email),
        gst_no: stringField(p.gst_no),
        drug_license_no: stringField(p.drug_license_no),
        district: stringField(p.district),
        state: stringField(p.state),
        payment_terms: stringField(p.payment_terms),
        is_active: p.is_active !== false,
        billing_address: {
          address_line_1: stringField(bAddr.address_line_1),
          address_line_2: stringField(bAddr.address_line_2),
          city: stringField(bAddr.city),
          state: stringField(bAddr.state),
          pincode: stringField(bAddr.pincode),
          country: stringField(bAddr.country) || "India",
        },
        shipping_address: {
          address_line_1: stringField(sAddr.address_line_1),
          address_line_2: stringField(sAddr.address_line_2),
          city: stringField(sAddr.city),
          state: stringField(sAddr.state),
          pincode: stringField(sAddr.pincode),
          country: stringField(sAddr.country) || "India",
        },
      });
    } else if (create) {
      setForm(defaultPartyState());
    }
  }, [rawParty, create]);

  // Clean form when modal closes
  useEffect(() => {
    if (!show) {
      setForm(defaultPartyState());
      setActiveTab("details");
    }
  }, [show]);

  // Keyboard shortcut (Escape to close)
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [show, isSaving, onClose]);

  // Submit Handler
  const handleSave = useCallback(async () => {
    if (!form.party_name.trim()) {
      toast.error("Party Name is required");
      return;
    }

    try {
      if (create) {
        await createParty(form as any).unwrap();
        toast.success(mutationSuccessCopy("createParty"));
        onClose();
      } else if (partyId) {
        // Calculate minimal diff payload
        const patch: Record<string, any> = {};
        const pObj = rawParty as any;
        const bAddr = pObj.billing_address || {};
        const sAddr = pObj.shipping_address || {};

        if (!valsEqual(form.party_name, pObj.party_name)) patch.party_name = form.party_name;
        if (!valsEqual(form.party_type, pObj.party_type)) patch.party_type = form.party_type;
        if (!valsEqual(form.contact_person, pObj.contact_person)) patch.contact_person = form.contact_person;
        if (!valsEqual(form.mobile, pObj.mobile)) patch.mobile = form.mobile;
        if (!valsEqual(form.email, pObj.email)) patch.email = form.email;
        if (!valsEqual(form.gst_no, pObj.gst_no)) patch.gst_no = form.gst_no;
        if (!valsEqual(form.drug_license_no, pObj.drug_license_no)) patch.drug_license_no = form.drug_license_no;
        if (!valsEqual(form.district, pObj.district)) patch.district = form.district;
        if (!valsEqual(form.state, pObj.state)) patch.state = form.state;
        if (!valsEqual(form.payment_terms, pObj.payment_terms)) patch.payment_terms = form.payment_terms;
        if (form.is_active !== pObj.is_active) patch.is_active = form.is_active;

        // Address diff
        const billingDiff: Record<string, any> = {};
        for (const [k, v] of Object.entries(form.billing_address)) {
          if (!valsEqual(v, bAddr[k])) billingDiff[k] = v;
        }
        if (Object.keys(billingDiff).length > 0) {
          patch.billing_address = { ...bAddr, ...billingDiff };
        }

        const shippingDiff: Record<string, any> = {};
        for (const [k, v] of Object.entries(form.shipping_address)) {
          if (!valsEqual(v, sAddr[k])) shippingDiff[k] = v;
        }
        if (Object.keys(shippingDiff).length > 0) {
          patch.shipping_address = { ...sAddr, ...shippingDiff };
        }

        if (Object.keys(patch).length === 0) {
          toast.info("No modifications detected");
          onClose();
          return;
        }

        await patchParty({ id: partyId, patch }).unwrap();
        toast.success(mutationSuccessCopy("patchParty"));
        onClose();
      }
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [form, create, partyId, rawParty, createParty, patchParty, onClose]);

  const copyBillingToShipping = () => {
    setForm((f) => ({
      ...f,
      shipping_address: { ...f.billing_address },
    }));
    toast.success("Billing address copied to shipping!");
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !isSaving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[min(90dvh,750px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {create ? "Add Party" : isFetching ? "Loading Details..." : form.party_name || "Party Detail"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {create ? "Create customer or supplier profile" : "View or edit contact and location records"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200/90 px-5 dark:border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "details"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Basic Info & Licenses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("address")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "address"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Addresses
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
          {isFetching && !create ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading profile data...</p>
          ) : activeTab === "details" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Party Name *</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Apollo Pharmacy / Cipla Ltd"
                  value={form.party_name}
                  onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Party Type</label>
                <select
                  className={inputClass}
                  value={form.party_type}
                  onChange={(e) => setForm((f) => ({ ...f, party_type: e.target.value as any }))}
                  disabled={isSaving}
                >
                  <option value="customer">Customer (Hospital / Retailer)</option>
                  <option value="supplier">Supplier (Distributor / Manufacturer)</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Contact Person</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Dr. Rajesh Kumar"
                  value={form.contact_person}
                  onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Mobile Number</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. +91 9999988888"
                  value={form.mobile}
                  onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="e.g. billing@apollomed.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>GSTIN</label>
                <input
                  type="text"
                  className={`${inputClass} uppercase`}
                  placeholder="e.g. 07AAAAA1111A1Z1"
                  value={form.gst_no}
                  onChange={(e) => setForm((f) => ({ ...f, gst_no: e.target.value.toUpperCase() }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Drug License No</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. DL-12345/6789"
                  value={form.drug_license_no}
                  onChange={(e) => setForm((f) => ({ ...f, drug_license_no: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>District</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Central Delhi"
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>State</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Delhi"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Payment Terms (Days / Type)</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Net 30, Cash on Delivery"
                  value={form.payment_terms}
                  onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="flex items-center gap-2 mt-7">
                <input
                  type="checkbox"
                  id="party-active"
                  className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  disabled={isSaving}
                />
                <label htmlFor="party-active" className="text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                  Is Active Profile
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Billing address */}
              <div className="space-y-4 rounded-xl border border-slate-200/90 p-4 dark:border-white/10 dark:bg-slate-950/20">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Billing Address</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className={labelClass}>Address Line 1</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.billing_address.address_line_1}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          billing_address: { ...f.billing_address, address_line_1: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className={labelClass}>Address Line 2</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.billing_address.address_line_2}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          billing_address: { ...f.billing_address, address_line_2: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>City</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.billing_address.city}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          billing_address: { ...f.billing_address, city: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>State</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.billing_address.state}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          billing_address: { ...f.billing_address, state: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Pincode</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.billing_address.pincode}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          billing_address: { ...f.billing_address, pincode: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Country</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.billing_address.country}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          billing_address: { ...f.billing_address, country: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </div>

              {/* Action trigger copy */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={copyBillingToShipping}
                  className="rounded bg-blue-50/50 border border-blue-200 text-blue-700 px-3 py-1.5 text-xs font-semibold hover:bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400"
                >
                  Copy to Shipping Address ↓
                </button>
              </div>

              {/* Shipping address */}
              <div className="space-y-4 rounded-xl border border-slate-200/90 p-4 dark:border-white/10 dark:bg-slate-950/20">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Shipping Address</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className={labelClass}>Address Line 1</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.shipping_address.address_line_1}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping_address: { ...f.shipping_address, address_line_1: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className={labelClass}>Address Line 2</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.shipping_address.address_line_2}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping_address: { ...f.shipping_address, address_line_2: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>City</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.shipping_address.city}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping_address: { ...f.shipping_address, city: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>State</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.shipping_address.state}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping_address: { ...f.shipping_address, state: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Pincode</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.shipping_address.pincode}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping_address: { ...f.shipping_address, pincode: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Country</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.shipping_address.country}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping_address: { ...f.shipping_address, country: e.target.value },
                        }))
                      }
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 border-t border-slate-200/90 px-5 py-3.5 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className={btnSecondaryClass}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {isSaving ? "Saving..." : create ? "Add Party" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
