/**
 * @fileoverview 2-Step Modal to convert a qualified lead to a Customer (Party) and submitted Order.
 * Step 1: Customer Creation / Linking (Ref: PartyDetailModal.tsx)
 * Step 2: Order Generation with Rate Type selection (Ref: AdminCreateOrderPage.tsx / CreateOrderPage.tsx)
 * @module components/portal/shared/leads/ConvertLeadModal
 */
"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2,
  UserPlus,
  Users,
  ShoppingCart,
  X,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Tag,
  SendHorizontal,
} from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useConvertLeadMutation,
  useListPartiesQuery,
  useListProductsQuery,
  type LeadRecord,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { PartyContactsEditor } from "@/components/portal/shared/PartyContactsEditor";
import {
  sanitizePartyContacts,
  type PartyContact,
} from "@/lib/partyContacts";

type Props = {
  lead: LeadRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type CustomerMode = "new_customer" | "existing_customer";

type RateType = "SR" | "SRA" | "CR";

type LineRow = {
  key: string;
  productId: string;
  product_name: string;
  sku: string;
  unit: string;
  quantity: number;
  applied_rate_type: RateType;
  remarks: string;
};

function newLine(overrides?: Partial<LineRow>): LineRow {
  return {
    key:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId: "",
    product_name: "",
    sku: "",
    unit: "pcs",
    quantity: 1,
    applied_rate_type: "SR",
    remarks: "",
    ...overrides,
  };
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white";
const labelClass = "block text-xs font-semibold text-slate-700 dark:text-slate-300";

export function ConvertLeadModal({ lead, open, onClose, onSuccess }: Props) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // -------------------------------------------------------------
  // Step 1: Customer State
  // -------------------------------------------------------------
  const [customerMode, setCustomerMode] = useState<CustomerMode>(
    lead.party_id ? "existing_customer" : "new_customer"
  );
  const [activeCustomerTab, setActiveCustomerTab] = useState<"details" | "contacts" | "address">("details");
  const [selectedPartyId, setSelectedPartyId] = useState<string>(
    typeof lead.party_id === "object" ? lead.party_id._id : lead.party_id || ""
  );
  const [partySearchQuery, setPartySearchQuery] = useState<string>("");

  // New customer fields
  const [partyName, setPartyName] = useState<string>(lead.company_name || lead.name);
  const [gstNo, setGstNo] = useState<string>("");
  const [drugLicenseNo, setDrugLicenseNo] = useState<string>("");
  const [paymentTerms, setPaymentTerms] = useState<string>("Net 30");

  const [contacts, setContacts] = useState<PartyContact[]>(() => {
    if (Array.isArray(lead.contacts) && lead.contacts.length > 0) {
      return lead.contacts.map((c) => ({
        name: c.name || "",
        phone: c.phone || "",
        email: c.email || "",
        designation: c.designation || "",
        department: c.department || "",
        alternate_phone: c.alternate_phone || "",
      }));
    }
    return [
      {
        name: lead.name || "",
        phone: lead.phone || "",
        email: lead.email || "",
        designation: lead.designation || "",
        department: "",
        alternate_phone: lead.alternate_phone || "",
      },
    ];
  });

  // Addresses
  const [billingAddress, setBillingAddress] = useState({
    address_line_1: lead.billing_address?.address_line_1 || "",
    address_line_2: lead.billing_address?.address_line_2 || "",
    city: lead.billing_address?.city || "",
    state: lead.billing_address?.state || "",
    pincode: lead.billing_address?.pincode || "",
    country: lead.billing_address?.country || "India",
  });

  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [shippingAddress, setShippingAddress] = useState({
    address_line_1: "",
    address_line_2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  });

  // -------------------------------------------------------------
  // Step 2: Order State (with Rate Type)
  // -------------------------------------------------------------
  const [orderItems, setOrderItems] = useState<LineRow[]>(() => {
    if (Array.isArray(lead.products) && lead.products.length > 0) {
      return lead.products.map((p) => {
        const prodObj = typeof p.product === "object" ? (p.product as Record<string, unknown>) : null;
        return newLine({
          productId: typeof p.product === "object" ? String(p.product._id || "") : (typeof p.product === "string" ? p.product : ""),
          product_name: p.product_name || (typeof prodObj?.product_name === "string" ? prodObj.product_name : ""),
          sku: typeof prodObj?.sku === "string" ? prodObj.sku : "",
          unit: p.unit || (typeof prodObj?.unit === "string" ? prodObj.unit : "pcs"),
          quantity: Math.max(1, Number(p.quantity || 1)),
          applied_rate_type: "SR",
          remarks: p.remarks || "",
        });
      });
    }
    return [newLine()];
  });

  const [orderDate, setOrderDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [deliveryDate, setDeliveryDate] = useState<string>(
    lead.expected_closing_date
      ? new Date(lead.expected_closing_date).toISOString().split("T")[0]
      : ""
  );
  const [orderRemarks, setOrderRemarks] = useState<string>(lead.requirement || "");

  // -------------------------------------------------------------
  // API Queries & Mutations
  // -------------------------------------------------------------
  const { data: partiesData, isLoading: loadingParties } = useListPartiesQuery({
    limit: "150",
  });
  const { data: productsData } = useListProductsQuery({
    limit: "200",
  });
  const [convertLead, { isLoading }] = useConvertLeadMutation();

  const partiesList = useMemo(() => {
    if (Array.isArray(partiesData)) return partiesData;
    if (partiesData && typeof partiesData === "object" && "items" in partiesData) {
      return (partiesData as { items: Array<Record<string, unknown>> }).items || [];
    }
    return [];
  }, [partiesData]);

  const productsList = useMemo(() => {
    if (Array.isArray(productsData)) return productsData;
    if (productsData && typeof productsData === "object" && "items" in productsData) {
      return (productsData as { items: Array<Record<string, unknown>> }).items || [];
    }
    return [];
  }, [productsData]);

  const filteredParties = useMemo(() => {
    const q = partySearchQuery.toLowerCase().trim();
    if (!q) return partiesList;
    return partiesList.filter((p) => {
      const name = String(p.party_name || "").toLowerCase();
      const mobile = String(p.mobile || "").toLowerCase();
      const gst = String(p.gst_no || "").toLowerCase();
      return name.includes(q) || mobile.includes(q) || gst.includes(q);
    });
  }, [partiesList, partySearchQuery]);

  const selectedExistingParty = useMemo(() => {
    if (!selectedPartyId) return null;
    return partiesList.find((p) => String(p._id || p.id) === String(selectedPartyId)) || null;
  }, [partiesList, selectedPartyId]);

  // Sync shipping address if sameAsBilling
  useEffect(() => {
    if (sameAsBilling) {
      setShippingAddress({ ...billingAddress });
    }
  }, [sameAsBilling, billingAddress]);

  if (!open) return null;

  const totalUnits = useMemo(() => {
    return orderItems.reduce((acc, row) => acc + Number(row.quantity || 0), 0);
  }, [orderItems]);

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------
  const handleProductSelect = (index: number, prodId: string) => {
    const prod = productsList.find((p) => String(p._id || p.id) === String(prodId));
    setOrderItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (!prod) return { ...row, productId: prodId };
        return {
          ...row,
          productId: prodId,
          product_name: String(prod.product_name || row.product_name),
          sku: String(prod.sku || ""),
          unit: String(prod.unit || "pcs"),
        };
      })
    );
  };

  const handleUpdateItem = (index: number, patch: Partial<LineRow>) => {
    setOrderItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleAddItem = () => {
    setOrderItems((prev) => [...prev, newLine()]);
  };

  const handleRemoveItem = (index: number) => {
    if (orderItems.length <= 1) {
      setOrderItems([newLine()]);
      return;
    }
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const validateStep1 = (): boolean => {
    if (customerMode === "existing_customer") {
      if (!selectedPartyId) {
        toast.error("Please select an existing customer");
        return false;
      }
    } else {
      if (!partyName.trim()) {
        toast.error("Customer / Company Name is required");
        return false;
      }
      const validContacts = sanitizePartyContacts(contacts);
      if (!validContacts.some((c) => c.phone || c.email)) {
        toast.error("At least one contact with a phone number or email is required");
        return false;
      }
    }
    return true;
  };

  const handleCompleteConversion = async (createOrderFlag: boolean) => {
    if (!validateStep1()) return;

    const validContacts = sanitizePartyContacts(contacts);

    const partyPayload =
      customerMode === "new_customer"
        ? {
            party_name: partyName.trim(),
            party_type: "customer",
            gst_no: gstNo.trim() ? gstNo.trim().toUpperCase() : undefined,
            drug_license_no: drugLicenseNo.trim() || undefined,
            payment_terms: paymentTerms,
            district: billingAddress.city,
            state: billingAddress.state,
            contacts: validContacts,
            billing_address: billingAddress,
            shipping_address: sameAsBilling ? billingAddress : shippingAddress,
          }
        : undefined;

    if (createOrderFlag) {
      const validItems = orderItems.filter((item) => item.product_name.trim() || item.productId);
      if (validItems.length === 0) {
        toast.error("Please add at least one product item to create the order");
        return;
      }
    }

    const orderItemsPayload = createOrderFlag
      ? orderItems
          .filter((item) => item.product_name.trim() || item.productId)
          .map((item) => ({
            productId: item.productId || undefined,
            product: item.productId || undefined,
            product_name: item.product_name.trim(),
            quantity: Math.max(1, Number(item.quantity || 1)),
            unit: item.unit || "pcs",
            applied_rate_type: item.applied_rate_type || "SR",
            remarks: item.remarks ? item.remarks.trim() : undefined,
          }))
      : undefined;

    const orderDataPayload = createOrderFlag
      ? {
          order_date: orderDate,
          delivery_date: deliveryDate || undefined,
          remarks: orderRemarks.trim() || undefined,
        }
      : undefined;

    try {
      await convertLead({
        id: lead._id,
        conversion_type: customerMode === "existing_customer" ? "existing_customer" : "new_customer",
        party_id: customerMode === "existing_customer" ? selectedPartyId : undefined,
        party_name: customerMode === "new_customer" ? partyName.trim() : undefined,
        party_data: partyPayload,
        create_order: createOrderFlag,
        order_items: orderItemsPayload,
        order_data: orderDataPayload,
        notes: orderRemarks.trim() || undefined,
      }).unwrap();

      toast.success(
        createOrderFlag
          ? "Lead converted to Customer and Order submitted successfully!"
          : "Lead converted to Customer successfully!"
      );
      onClose();
      onSuccess?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <LargeModalPortal>
      <ModalOverlay onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Convert Lead
                  </h3>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                    Step {currentStep} of 2
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lead #{lead.lead_no} • {lead.name} {lead.company_name ? `(${lead.company_name})` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stepper Indicator */}
          <div className="grid grid-cols-2 border-b border-slate-100 bg-slate-50/70 text-xs font-semibold dark:border-white/5 dark:bg-slate-950/30">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`flex items-center justify-center gap-2 py-3 transition-all border-b-2 ${
                currentStep === 1
                  ? "border-blue-600 text-blue-600 bg-white dark:border-blue-400 dark:bg-slate-900 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                currentStep === 1
                  ? "bg-blue-600 text-white dark:bg-blue-500"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                1
              </span>
              <span>1. Customer Creation & Linking</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setCurrentStep(2);
              }}
              className={`flex items-center justify-center gap-2 py-3 transition-all border-b-2 ${
                currentStep === 2
                  ? "border-blue-600 text-blue-600 bg-white dark:border-blue-400 dark:bg-slate-900 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                currentStep === 2
                  ? "bg-blue-600 text-white dark:bg-blue-500"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                2
              </span>
              <span>2. Order Configuration & Rate Types</span>
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ========================================================= */}
            {/* STEP 1: CUSTOMER SETUP                                    */}
            {/* ========================================================= */}
            {currentStep === 1 && (
              <div className="space-y-6">
                {/* Mode Selector */}
                <div>
                  <label className={labelClass}>Customer Onboarding Mode</label>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCustomerMode("new_customer")}
                      className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                        customerMode === "new_customer"
                          ? "border-blue-500 bg-blue-50/70 text-blue-900 shadow-sm dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200"
                          : "border-slate-200 bg-slate-50/40 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        <UserPlus className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold">Create New Customer Party</div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Register a new hospital/client record from lead details
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCustomerMode("existing_customer")}
                      className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                        customerMode === "existing_customer"
                          ? "border-blue-500 bg-blue-50/70 text-blue-900 shadow-sm dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200"
                          : "border-slate-200 bg-slate-50/40 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold">Link to Existing Party</div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Connect this deal to an already registered customer
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Existing Customer Selector */}
                {customerMode === "existing_customer" && (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4 dark:border-white/10 dark:bg-slate-800/20">
                    <div>
                      <label className={labelClass}>
                        Search & Select Existing Customer <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          type="text"
                          value={partySearchQuery}
                          onChange={(e) => setPartySearchQuery(e.target.value)}
                          placeholder="Search customer by name, phone or GSTIN..."
                          className={`${inputClass} pl-9`}
                        />
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 divide-y divide-slate-100 dark:border-white/10 dark:bg-slate-900 dark:divide-white/5">
                      {loadingParties ? (
                        <div className="p-4 text-center text-xs text-slate-400">Loading customer directory...</div>
                      ) : filteredParties.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">No matching parties found.</div>
                      ) : (
                        filteredParties.slice(0, 15).map((p) => {
                          const id = String(p._id || p.id);
                          const isSelected = id === selectedPartyId;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setSelectedPartyId(id)}
                              className={`w-full flex items-center justify-between p-2.5 text-left text-xs transition rounded-lg ${
                                isSelected
                                  ? "bg-blue-50 text-blue-900 font-semibold dark:bg-blue-950/60 dark:text-blue-200"
                                  : "hover:bg-slate-50 text-slate-700 dark:text-slate-300 dark:hover:bg-white/5"
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {p.party_name}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                  {p.mobile && <span>Ph: {p.mobile}</span>}
                                  {p.gst_no && <span>GST: {p.gst_no}</span>}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                                  Selected
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {selectedExistingParty && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                        <div className="font-bold">Selected Customer: {selectedExistingParty.party_name}</div>
                        <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                          {selectedExistingParty.contact_person && `Contact: ${selectedExistingParty.contact_person} • `}
                          {selectedExistingParty.mobile && `Mobile: ${selectedExistingParty.mobile} • `}
                          {selectedExistingParty.email && `Email: ${selectedExistingParty.email}`}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* New Customer Form (PartyDetailModal Reference) */}
                {customerMode === "new_customer" && (
                  <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                    {/* Sub-tabs */}
                    <div className="flex border-b border-slate-100 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => setActiveCustomerTab("details")}
                        className={`border-b-2 px-4 py-2 text-xs font-bold transition ${
                          activeCustomerTab === "details"
                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                            : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        1. Basic Info & Commercials
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCustomerTab("contacts")}
                        className={`border-b-2 px-4 py-2 text-xs font-bold transition ${
                          activeCustomerTab === "contacts"
                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                            : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        2. Contact Persons ({contacts.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCustomerTab("address")}
                        className={`border-b-2 px-4 py-2 text-xs font-bold transition ${
                          activeCustomerTab === "address"
                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                            : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        3. Billing & Shipping Address
                      </button>
                    </div>

                    {/* Tab 1: Details */}
                    {activeCustomerTab === "details" && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                        <div className="sm:col-span-2">
                          <label className={labelClass}>
                            Customer / Hospital / Company Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={partyName}
                            onChange={(e) => setPartyName(e.target.value)}
                            placeholder="e.g. Apollo Hospitals / Care Diagnostic"
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>GST Number (GSTIN)</label>
                          <input
                            type="text"
                            value={gstNo}
                            onChange={(e) => setGstNo(e.target.value)}
                            placeholder="27AAAAA0000A1Z5"
                            className={`${inputClass} uppercase`}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Drug License No (DL)</label>
                          <input
                            type="text"
                            value={drugLicenseNo}
                            onChange={(e) => setDrugLicenseNo(e.target.value)}
                            placeholder="DL-XXXX-XXXX"
                            className={inputClass}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={labelClass}>Standard Payment Terms</label>
                          <select
                            value={paymentTerms}
                            onChange={(e) => setPaymentTerms(e.target.value)}
                            className={inputClass}
                          >
                            <option value="Advance">100% Advance Payment</option>
                            <option value="Net 15">Net 15 Days</option>
                            <option value="Net 30">Net 30 Days</option>
                            <option value="Net 45">Net 45 Days</option>
                            <option value="Net 60">Net 60 Days</option>
                            <option value="COD">Cash on Delivery (COD)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Contacts */}
                    {activeCustomerTab === "contacts" && (
                      <div className="space-y-4 pt-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Configure customer contact persons. The primary contact is used for official billing communications.
                        </p>
                        <PartyContactsEditor
                          contacts={contacts}
                          onChange={setContacts}
                        />
                      </div>
                    )}

                    {/* Tab 3: Addresses */}
                    {activeCustomerTab === "address" && (
                      <div className="space-y-5 pt-2">
                        {/* Billing */}
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Billing Address
                          </h4>
                          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label className={labelClass}>Address Line 1</label>
                              <input
                                type="text"
                                value={billingAddress.address_line_1}
                                onChange={(e) =>
                                  setBillingAddress({ ...billingAddress, address_line_1: e.target.value })
                                }
                                placeholder="Premises, Building, Street"
                                className={inputClass}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelClass}>Address Line 2</label>
                              <input
                                type="text"
                                value={billingAddress.address_line_2}
                                onChange={(e) =>
                                  setBillingAddress({ ...billingAddress, address_line_2: e.target.value })
                                }
                                placeholder="Area, Landmark"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>City</label>
                              <input
                                type="text"
                                value={billingAddress.city}
                                onChange={(e) =>
                                  setBillingAddress({ ...billingAddress, city: e.target.value })
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>State</label>
                              <input
                                type="text"
                                value={billingAddress.state}
                                onChange={(e) =>
                                  setBillingAddress({ ...billingAddress, state: e.target.value })
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Pincode</label>
                              <input
                                type="text"
                                value={billingAddress.pincode}
                                onChange={(e) =>
                                  setBillingAddress({ ...billingAddress, pincode: e.target.value })
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Country</label>
                              <input
                                type="text"
                                value={billingAddress.country}
                                onChange={(e) =>
                                  setBillingAddress({ ...billingAddress, country: e.target.value })
                                }
                                className={inputClass}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Shipping */}
                        <div className="border-t border-slate-100 pt-4 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Shipping / Delivery Address
                            </h4>
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sameAsBilling}
                                onChange={(e) => setSameAsBilling(e.target.checked)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              Same as Billing Address
                            </label>
                          </div>

                          {!sameAsBilling && (
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <label className={labelClass}>Address Line 1</label>
                                <input
                                  type="text"
                                  value={shippingAddress.address_line_1}
                                  onChange={(e) =>
                                    setShippingAddress({ ...shippingAddress, address_line_1: e.target.value })
                                  }
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>City</label>
                                <input
                                  type="text"
                                  value={shippingAddress.city}
                                  onChange={(e) =>
                                    setShippingAddress({ ...shippingAddress, city: e.target.value })
                                  }
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>State</label>
                                <input
                                  type="text"
                                  value={shippingAddress.state}
                                  onChange={(e) =>
                                    setShippingAddress({ ...shippingAddress, state: e.target.value })
                                  }
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Pincode</label>
                                <input
                                  type="text"
                                  value={shippingAddress.pincode}
                                  onChange={(e) =>
                                    setShippingAddress({ ...shippingAddress, pincode: e.target.value })
                                  }
                                  className={inputClass}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* STEP 2: ORDER CONFIGURATION WITH RATE TYPES               */}
            {/* ========================================================= */}
            {currentStep === 2 && (
              <div className="space-y-6">
                {/* Header overview pill */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        Create & Submit Order
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Customer: <strong className="text-slate-700 dark:text-slate-200">{partyName || selectedExistingParty?.party_name}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
                      Total Items: {orderItems.length} ({totalUnits} units)
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Pricing and commercials resolved automatically by selected Rate Types
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={labelClass}>
                      Order Products & Rate Types ({orderItems.length})
                    </label>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Product Row
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="border-b border-slate-100 bg-slate-50 font-bold uppercase text-slate-500 dark:border-white/5 dark:bg-slate-800/50 dark:text-slate-400">
                        <tr>
                          <th className="px-3.5 py-2.5 min-w-[260px]">Product / Item</th>
                          <th className="px-2.5 py-2.5 text-center w-28">Quantity</th>
                          <th className="px-2.5 py-2.5 text-center w-36">Rate Type</th>
                          <th className="px-3.5 py-2.5 min-w-[180px]">Line Remarks</th>
                          <th className="px-2.5 py-2.5 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {orderItems.map((item, idx) => {
                          return (
                            <tr key={item.key} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                              {/* Product Name / Selection */}
                              <td className="p-2.5 space-y-1">
                                <select
                                  value={item.productId}
                                  onChange={(e) => handleProductSelect(idx, e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                                >
                                  <option value="">Choose catalog product...</option>
                                  {productsList.map((p) => (
                                    <option key={String(p._id || p.id)} value={String(p._id || p.id)}>
                                      {p.product_name} {p.sku ? `(${p.sku})` : ""}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={item.product_name}
                                  onChange={(e) => handleUpdateItem(idx, { product_name: e.target.value })}
                                  placeholder="Custom description / item name"
                                  className="w-full rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-1 text-[11px] text-slate-700 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-300"
                                />
                              </td>

                              {/* Quantity & Unit */}
                              <td className="p-2.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleUpdateItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                                  />
                                  <span className="text-[10px] text-slate-400 uppercase">{item.unit || "pcs"}</span>
                                </div>
                              </td>

                              {/* Rate Type */}
                              <td className="p-2.5">
                                <select
                                  value={item.applied_rate_type}
                                  onChange={(e) => handleUpdateItem(idx, { applied_rate_type: e.target.value as RateType })}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-blue-700 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-blue-300"
                                >
                                  <option value="SR">SR (Standard Rate)</option>
                                  <option value="SRA">SRA (Special Rate)</option>
                                  <option value="CR">CR (Contract Rate)</option>
                                </select>
                              </td>

                              {/* Remarks */}
                              <td className="p-2.5">
                                <input
                                  type="text"
                                  value={item.remarks}
                                  onChange={(e) => handleUpdateItem(idx, { remarks: e.target.value })}
                                  placeholder="Batch, pack size or delivery notes..."
                                  className="w-full rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-1 text-xs text-slate-700 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-300"
                                />
                              </td>

                              {/* Remove */}
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="rounded p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Additional Order Meta Fields */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Order Date</label>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Expected Delivery Date</label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelClass}>Order Remarks / Delivery Instructions</label>
                    <textarea
                      rows={2}
                      value={orderRemarks}
                      onChange={(e) => setOrderRemarks(e.target.value)}
                      placeholder="Special logistics instructions, dispatch guidelines, or commercial terms..."
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer Controls */}
          <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-white/10 dark:bg-slate-950/20">
            {currentStep === 1 ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleCompleteConversion(false)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {isLoading ? "Saving..." : "Convert Customer Only"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (validateStep1()) setCurrentStep(2);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                  >
                    <span>Next: Configure Order</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Customer Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCompleteConversion(true)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  <SendHorizontal className="h-4 w-4" />
                  <span>{isLoading ? "Submitting Order..." : "Complete Conversion & Submit Order"}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}
