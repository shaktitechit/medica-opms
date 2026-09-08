import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Plus,
  Trash2,
  Calculator,
  FileText,
  Building2,
  UserCheck,
  RotateCcw,
  ShieldCheck,
  RefreshCw,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  useCreateLeadQuotationMutation,
  useUpdateLeadQuotationMutation,
  useGetDefaultQuotationTermsQuery,
  useListTermsAndConditionsQuery,
  useListProductsQuery,
  useGetCompanyInfoQuery,
  useListUsersQuery,
  useListLeadsQuery,
  useListQuotationsQuery,
  type LeadRecord,
  type LeadQuotationRecord,
  type CreateQuotationPayload,
  type TermsAndConditionsRecord,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { formatCurrencyINR, canCreateQuotation, canManageQuotations } from "./quotationUtils";
import { RichTextEditor } from "./RichTextEditor";

type Props = {
  lead?: LeadRecord | null;
  quotation?: LeadQuotationRecord | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: (quotation: LeadQuotationRecord) => void;
};

type ItemState = {
  product?: string;
  product_name: string;
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
};

function computeNextRefNo(existingQuotations: LeadQuotationRecord[]): string {
  let maxSeq = 1000;
  if (Array.isArray(existingQuotations) && existingQuotations.length > 0) {
    for (const q of existingQuotations) {
      const ref = q.ref_no || q.quotation_no || "";
      const matches = String(ref).match(/(\d+)/g);
      if (matches && matches.length > 0) {
        const num = parseInt(matches[matches.length - 1], 10);
        if (!Number.isNaN(num) && num < 1000000 && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }
  return `Q-${maxSeq + 1}`;
}

export function QuotationFormModal({
  lead,
  quotation,
  open,
  onClose,
  onSuccess,
}: Props) {
  const isEditing = Boolean(quotation?._id);
  const authUser = useAppSelector((state) => state.auth.user);

  const { data: productsData } = useListProductsQuery({ limit: "500" });
  const products = (
    Array.isArray(productsData)
      ? productsData
      : (productsData as { items?: unknown[] })?.items || []
  ) as Array<{ _id: string; product_name: string; sku?: string; hsn_code?: string; base_price?: number; unit?: string }>;

  const { data: companyData } = useGetCompanyInfoQuery();
  const company = companyData as Record<string, unknown> | undefined;

  const { data: usersData } = useListUsersQuery();
  const usersList = (
    Array.isArray(usersData)
      ? usersData
      : (usersData as { items?: unknown[] })?.items || (usersData as { data?: unknown[] })?.data || []
  ) as Array<{ _id: string; name: string; email: string; phone?: string; department?: string; is_active?: boolean }>;

  const adminUsers = useMemo(() => {
    return usersList.filter(
      (u) => u.department === "admin" || u.department === "super_admin" || u.department === "finance"
    );
  }, [usersList]);

  // Default terms fetched dynamically from the database
  const { data: dbDefaultTerms, refetch: refetchDbTerms } = useGetDefaultQuotationTermsQuery(
    undefined,
    { skip: !open }
  );

  // Master Terms & Conditions sets list for multi-selection
  const { data: masterTermsData } = useListTermsAndConditionsQuery(
    { limit: 100 },
    { skip: !open }
  );

  const masterTermsSets: TermsAndConditionsRecord[] = useMemo(() => {
    if (!masterTermsData) return [];
    if (Array.isArray(masterTermsData.terms_and_conditions)) {
      return masterTermsData.terms_and_conditions;
    }
    return [];
  }, [masterTermsData]);

  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);

  const { data: leadsData } = useListLeadsQuery({ limit: 200 }, { skip: !open });
  const leadsList = useMemo(() => {
    if (Array.isArray(leadsData)) return leadsData;
    if (leadsData && typeof leadsData === "object" && "items" in leadsData) {
      return (leadsData as { items: LeadRecord[] }).items || [];
    }
    if (leadsData && typeof leadsData === "object" && "leads" in leadsData) {
      return (leadsData as { leads: LeadRecord[] }).leads || [];
    }
    return [];
  }, [leadsData]);

  const { data: quotationsData, refetch: refetchQuotations } = useListQuotationsQuery(
    { limit: 500 },
    { skip: !open }
  );

  const existingQuotations = useMemo(() => {
    if (Array.isArray(quotationsData)) return quotationsData;
    if (quotationsData && typeof quotationsData === "object" && "quotations" in quotationsData) {
      return (quotationsData as { quotations: LeadQuotationRecord[] }).quotations || [];
    }
    return [];
  }, [quotationsData]);

  const autoNextRefNo = useMemo(() => {
    return computeNextRefNo(existingQuotations);
  }, [existingQuotations]);

  const [selectedLeadId, setSelectedLeadId] = useState<string>("");

  const handleLeadSelect = (lId: string) => {
    setSelectedLeadId(lId);
    if (!lId) {
      setCustomerName("");
      setKindAttn("");
      setPhone("");
      setCell("");
      setEmail("");
      setAddressLine("");
      setCity("");
      setState("");
      setPincode("");
      return;
    }
    const targetLead = leadsList.find((l) => l._id === lId);
    if (!targetLead) return;

    const leadOrg =
      targetLead.company_name ||
      targetLead.party_id?.party_name ||
      `M/s. ${targetLead.name || "Customer"}`.trim();
    setCustomerName(leadOrg);
    setKindAttn(targetLead.name || targetLead.contacts?.[0]?.name || "");
    setPhone(targetLead.phone || targetLead.contacts?.[0]?.phone || "");
    setCell(targetLead.alternate_phone || targetLead.phone || targetLead.contacts?.[0]?.phone || "");
    setEmail(targetLead.email || targetLead.contacts?.[0]?.email || "");
    setAddressLine(
      targetLead.billing_address?.address_line_1 ||
      targetLead.party_id?.billing_address?.address_line_1 ||
      ""
    );
    setCity(targetLead.billing_address?.city || targetLead.party_id?.district || "");
    setState(targetLead.billing_address?.state || targetLead.party_id?.state || "");
    setPincode(targetLead.billing_address?.pincode || "");

    if (targetLead.products && targetLead.products.length > 0) {
      setItems(
        (targetLead.products as Array<{ product?: unknown; product_name?: string; remarks?: string; quantity?: number; unit?: string; target_price?: number }>).map((p) => {
          const pObj = typeof p.product === "object" && p.product !== null ? (p.product as { _id?: string; product_name?: string; unit?: string; base_price?: number }) : null;
          return {
            product: typeof p.product === "string" ? p.product : pObj?._id,
            product_name: p.product_name || pObj?.product_name || "Medical Equipment",
            description: p.remarks || "",
            hsn_code: "9018",
            quantity: p.quantity || 1,
            unit: p.unit || pObj?.unit || "Nos",
            rate: p.target_price || pObj?.base_price || 0,
            gst_rate: 5,
          };
        })
      );
      setSubject(`Offer For ${targetLead.products[0]?.product_name || "Medical Equipment"}`);
    } else {
      setItems([
        {
          product_name: targetLead.requirement || "Fresenius Hemodialysis Machine",
          description: "",
          hsn_code: "9018",
          quantity: 1,
          unit: "Nos",
          rate: targetLead.estimated_value || 0,
          gst_rate: 5,
        },
      ]);
      setSubject(`Offer For ${targetLead.requirement || "Medical Equipment"}`);
    }
  };

  // Form State
  const [refNo, setRefNo] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [quotationDate, setQuotationDate] = useState("");
  const [validityDays, setValidityDays] = useState(15);

  // Compute calculated validity expiry date (Quotation Date + Validity Days)
  const validityEndDate = useMemo(() => {
    if (!quotationDate) return "";
    try {
      const d = new Date(quotationDate);
      if (isNaN(d.getTime())) return "";
      d.setDate(d.getDate() + (Number(validityDays) || 15));
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  }, [quotationDate, validityDays]);

  const handleValidityEndDateChange = (eDateStr: string) => {
    if (!eDateStr || !quotationDate) return;
    try {
      const start = new Date(quotationDate);
      const end = new Date(eDateStr);
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        setValidityDays(diffDays);
      }
    } catch {
      // ignore
    }
  };
  const [subject, setSubject] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [kindAttn, setKindAttn] = useState("");
  const [phone, setPhone] = useState("");
  const [cell, setCell] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");

  // Signatory State (Assigned Admin User info printed on PDF)
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryPhone, setSignatoryPhone] = useState("");
  const [signatoryEmail, setSignatoryEmail] = useState("");
  const [signatoryDesignation, setSignatoryDesignation] = useState("Authorized Signatory");

  const [items, setItems] = useState<ItemState[]>([
    {
      product_name: "",
      description: "",
      hsn_code: "9018",
      quantity: 1,
      unit: "Nos",
      rate: 0,
      gst_rate: 5,
    },
  ]);

  const [terms, setTerms] = useState<string[]>([]);
  const [showTerms, setShowTerms] = useState(true);

  const [createQuotation, { isLoading: isCreating }] = useCreateLeadQuotationMutation();
  const [updateQuotation, { isLoading: isUpdating }] = useUpdateLeadQuotationMutation();

  // Populate or reset form
  useEffect(() => {
    if (!open) return;

    if (quotation) {
      setRefNo(quotation.ref_no || "");
      setCustomerRef(quotation.customer_ref || "");
      setQuotationDate(
        quotation.quotation_date
          ? new Date(quotation.quotation_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0]
      );
      setValidityDays(quotation.validity_days || 15);
      setSubject(quotation.subject || "");
      setCustomerName(quotation.customer_name || "");
      setKindAttn(quotation.kind_attn || "");
      setPhone(quotation.phone || "");
      setCell(quotation.cell || "");
      setEmail(quotation.email || "");
      setGstin(quotation.gstin || "");
      setAddressLine(quotation.address?.address_line_1 || "");
      setCity(quotation.address?.city || "");
      setState(quotation.address?.state || "");
      setPincode(quotation.address?.pincode || "");

      // Signatory from quotation
      setSignatoryName(quotation.signatory_name || "");
      setSignatoryPhone(quotation.signatory_phone || "");
      setSignatoryEmail(quotation.signatory_email || "");
      setSignatoryDesignation(quotation.signatory_designation || "Authorized Signatory");

      if (quotation.items && quotation.items.length > 0) {
        setItems(
          quotation.items.map((i) => ({
            product: i.product,
            product_name: i.product_name,
            description: i.description || "",
            hsn_code: i.hsn_code || "9018",
            quantity: i.quantity || 1,
            unit: i.unit || "Nos",
            rate: i.rate || 0,
            gst_rate: i.gst_rate ?? 5,
          }))
        );
      }
      setTerms(
        quotation.terms_and_conditions && quotation.terms_and_conditions.length > 0
          ? quotation.terms_and_conditions
          : (dbDefaultTerms || [])
      );
    } else if (lead) {
      // New quotation from Lead
      setRefNo(autoNextRefNo);
      setCustomerRef("");
      setQuotationDate(new Date().toISOString().split("T")[0]);
      setValidityDays(15);
      const leadOrg =
        lead.company_name ||
        lead.party_id?.party_name ||
        `M/s. ${lead.name || "Customer"}`.trim();
      setCustomerName(leadOrg);
      setKindAttn(lead.name || lead.contacts?.[0]?.name || "");
      setPhone(lead.phone || lead.contacts?.[0]?.phone || "");
      setCell(lead.alternate_phone || lead.phone || lead.contacts?.[0]?.phone || "");
      setEmail(lead.email || lead.contacts?.[0]?.email || "");
      setGstin("");
      setAddressLine(
        lead.billing_address?.address_line_1 ||
        lead.party_id?.billing_address?.address_line_1 ||
        ""
      );
      setCity(lead.billing_address?.city || lead.party_id?.district || "");
      setState(lead.billing_address?.state || lead.party_id?.state || "");
      setPincode(lead.billing_address?.pincode || "");

      // Resolve Signatory from admin / super_admin / finance roster (excluding sales)
      const assigned = lead.assigned_to;
      let defaultAdminUser: { name?: string; phone?: string; email?: string; department?: string } | null = null;

      if (
        typeof assigned === "object" &&
        assigned !== null &&
        ["admin", "super_admin", "finance"].includes(assigned.department || "")
      ) {
        defaultAdminUser = assigned;
      } else if (typeof assigned === "string" && assigned) {
        const found = usersList.find((u) => u._id === assigned);
        if (found && ["admin", "super_admin", "finance"].includes(found.department || "")) {
          defaultAdminUser = found;
        }
      }

      if (!defaultAdminUser && adminUsers.length > 0) {
        defaultAdminUser = adminUsers[0];
      }

      setSignatoryName(defaultAdminUser?.name || (authUser as { name?: string })?.name || "");
      setSignatoryPhone(defaultAdminUser?.phone || (authUser as { phone?: string })?.phone || "");
      setSignatoryEmail(defaultAdminUser?.email || (authUser as { email?: string })?.email || "");
      setSignatoryDesignation(
        defaultAdminUser?.department
          ? defaultAdminUser.department.charAt(0).toUpperCase() + defaultAdminUser.department.slice(1)
          : "Authorized Signatory"
      );

      // Initial line items from lead products if available
      if (lead.products && lead.products.length > 0) {
        setItems(
          lead.products.map((p) => {
            const pObj = typeof p.product === "object" ? p.product : null;
            return {
              product: typeof p.product === "string" ? p.product : pObj?._id,
              product_name: p.product_name || pObj?.product_name || "Medical Equipment",
              description: p.remarks || "",
              hsn_code: "9018",
              quantity: p.quantity || 1,
              unit: p.unit || pObj?.unit || "Nos",
              rate: p.target_price || pObj?.base_price || 0,
              gst_rate: 5,
            };
          })
        );
        setSubject(`Offer For ${lead.products[0]?.product_name || "Medical Equipment"}`);
      } else {
        setItems([
          {
            product_name: lead.requirement || "Fresenius Hemodialysis Machine Fresenius 4008 A",
            description: "",
            hsn_code: "9018",
            quantity: 1,
            unit: "Nos",
            rate: lead.estimated_value || 0,
            gst_rate: 5,
          },
        ]);
        setSubject(`Offer For ${lead.requirement || "Medical Equipment"}`);
      }
      if (dbDefaultTerms && dbDefaultTerms.length > 0) {
        setTerms(dbDefaultTerms);
      }
    } else {
      setRefNo(autoNextRefNo);
      setCustomerRef("");
      setQuotationDate(new Date().toISOString().split("T")[0]);
      setValidityDays(15);
      setCustomerName("");
      setKindAttn("");
      setPhone("");
      setCell("");
      setEmail("");
      setGstin("");
      setAddressLine("");
      setCity("");
      setState("");
      setPincode("");
      setSignatoryName((authUser as { name?: string })?.name || "");
      setSignatoryPhone((authUser as { phone?: string })?.phone || "");
      setSignatoryEmail((authUser as { email?: string })?.email || "");
      setSignatoryDesignation("Authorized Signatory");
      setItems([
        {
          product_name: "Medical Equipment / Supplies",
          description: "",
          hsn_code: "9018",
          quantity: 1,
          unit: "Nos",
          rate: 0,
          gst_rate: 5,
        },
      ]);
      setSubject("Offer For Medical Equipment");
      if (dbDefaultTerms && dbDefaultTerms.length > 0) {
        setTerms(dbDefaultTerms);
      }
    }
  }, [open, quotation, lead, dbDefaultTerms, usersList, adminUsers, authUser, autoNextRefNo]);

  const handleSelectAdminUser = (userId: string) => {
    const selected = usersList.find((u) => u._id === userId);
    if (!selected) return;
    setSignatoryName(selected.name || "");
    setSignatoryPhone(selected.phone || "");
    setSignatoryEmail(selected.email || "");
    setSignatoryDesignation(
      selected.department
        ? selected.department.charAt(0).toUpperCase() + selected.department.slice(1)
        : "Authorized Signatory"
    );
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalGst = 0;

    const computedItems = items.map((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const taxable = Math.round(qty * rate * 100) / 100;
      const gstRate = Number(item.gst_rate) || 0;
      const gstAmt = Math.round(((taxable * gstRate) / 100) * 100) / 100;
      const lineTotal = Math.round((taxable + gstAmt) * 100) / 100;

      subtotal += taxable;
      totalGst += gstAmt;

      return {
        ...item,
        taxable,
        gstAmt,
        lineTotal,
      };
    });

    subtotal = Math.round(subtotal * 100) / 100;
    totalGst = Math.round(totalGst * 100) / 100;
    const rawGrandTotal = subtotal + totalGst;
    const grandTotal = Math.round(rawGrandTotal);
    const roundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;

    return {
      items: computedItems,
      subtotal,
      totalGst,
      roundOff,
      grandTotal,
    };
  }, [items]);

  // Product Selection handler
  const handleSelectProduct = (index: number, productId: string) => {
    const found = products.find((p) => p._id === productId);
    if (!found) return;

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        return {
          ...it,
          product: found._id,
          product_name: found.product_name,
          hsn_code: found.hsn_code || "9018",
          rate: found.base_price || it.rate || 0,
          unit: found.unit || it.unit || "Nos",
        };
      })
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_name: "",
        description: "",
        hsn_code: "9018",
        quantity: 1,
        unit: "Nos",
        rate: 0,
        gst_rate: 5,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error("Quotation must have at least one product item");
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleTermChange = (index: number, val: string) => {
    setTerms((prev) => prev.map((t, idx) => (idx === index ? val : t)));
  };

  const handleToggleTermsSet = (setId: string) => {
    const nextSetIds = selectedSetIds.includes(setId)
      ? selectedSetIds.filter((id) => id !== setId)
      : [...selectedSetIds, setId];

    setSelectedSetIds(nextSetIds);

    const compiled: string[] = [];
    masterTermsSets.forEach((set) => {
      if (nextSetIds.includes(set._id)) {
        (set.terms_text || []).forEach((t) => {
          if (t.text && t.text.trim()) {
            compiled.push(t.text.trim());
          }
        });
      }
    });

    setTerms(compiled);
  };

  const handleSelectAllSets = () => {
    const allIds = masterTermsSets.map((s) => s._id);
    setSelectedSetIds(allIds);
    const compiled: string[] = [];
    masterTermsSets.forEach((set) => {
      (set.terms_text || []).forEach((t) => {
        if (t.text && t.text.trim()) {
          compiled.push(t.text.trim());
        }
      });
    });
    setTerms(compiled);
  };

  const handleDeselectAllSets = () => {
    setSelectedSetIds([]);
    setTerms([]);
  };

  const handleAddTerm = () => {
    setTerms((prev) => [...prev, "New Condition: Enter terms details here."]);
  };

  const handleRemoveTerm = (index: number) => {
    setTerms((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleResetTerms = async () => {
    const res = await refetchDbTerms();
    if (res.data && res.data.length > 0) {
      setTerms(res.data);
      toast.success("Terms reset to default database standard conditions");
    } else {
      toast.info("No default terms configured in database");
    }
  };

  // Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManageQuotations(authUser)) {
      toast.error("Only administrators can create or edit quotations");
      return;
    }

    if (!isEditing && lead && !canCreateQuotation(lead.status)) {
      toast.error(`Quotations cannot be generated for leads in '${lead.status}' status`);
      return;
    }

    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }

    if (items.some((i) => !i.product_name.trim())) {
      toast.error("All line items must have a product name");
      return;
    }

    if (items.some((i) => Number(i.quantity) <= 0)) {
      toast.error("Item quantity must be greater than 0");
      return;
    }

    const cleanedTerms = terms.map((t) => t.trim()).filter(Boolean);

    const payload: CreateQuotationPayload = {
      ref_no: refNo.trim() || undefined,
      customer_ref: customerRef.trim() || undefined,
      quotation_date: quotationDate ? new Date(quotationDate).toISOString() : new Date().toISOString(),
      validity_days: Number(validityDays) || 15,
      subject: subject.trim() || undefined,
      customer_name: customerName.trim(),
      kind_attn: kindAttn.trim(),
      phone: phone.trim(),
      cell: cell.trim(),
      email: email.trim(),
      gstin: gstin.trim(),
      address: {
        address_line_1: addressLine.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        country: "India",
      },
      items: items.map((i) => ({
        product: i.product,
        product_name: i.product_name.trim(),
        description: i.description.trim(),
        hsn_code: i.hsn_code.trim() || "9018",
        quantity: Number(i.quantity) || 1,
        unit: i.unit.trim() || "Nos",
        rate: Number(i.rate) || 0,
        gst_rate: Number(i.gst_rate) || 0,
      })),
      terms_and_conditions: cleanedTerms,
      signatory_name: signatoryName.trim(),
      signatory_phone: signatoryPhone.trim(),
      signatory_email: signatoryEmail.trim(),
      signatory_designation: signatoryDesignation.trim(),
    };

    const targetLeadId = selectedLeadId || lead?._id || (typeof quotation?.lead === "object" ? quotation.lead?._id : quotation?.lead) || "";

    try {
      if (isEditing && quotation?._id) {
        const res = await updateQuotation({
          quotationId: quotation._id,
          leadId: targetLeadId,
          body: payload,
        }).unwrap();
        toast.success(`Quotation ${res.quotation_no} updated successfully`);
        onSuccess?.(res);
      } else {
        const res = await createQuotation({
          leadId: targetLeadId,
          body: payload,
        }).unwrap();
        toast.success(`Quotation ${res.quotation_no} created successfully`);
        onSuccess?.(res);
      }
      onClose();
    } catch (err: unknown) {
      toast.error(mutationRejectedMessage(err) || "Failed to save quotation");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3 sm:p-6 backdrop-blur-xs">
      <div className="relative flex max-h-[96vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isEditing ? `Edit Quotation #${quotation?.quotation_no}` : "Generate Quotation"}
              </h3>
              <p className="text-xs text-slate-500">
                Official Letterhead format quotation for {customerName || lead?.name || "Customer"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Lead Link / Direct Selection Banner */}
            {!isEditing && !lead && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
                <label className="block text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-1.5 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Quotation Type &amp; Lead Link Source
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <select
                    value={selectedLeadId}
                    onChange={(e) => handleLeadSelect(e.target.value)}
                    className="flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="">-- Direct Quotation (Standalone Proposal) --</option>
                    {leadsList.map((l) => (
                      <option key={l._id} value={l._id}>
                        Link to Lead: {l.company_name || l.name || "Lead"} ({l.organization_name || l.lead_no || "Active"})
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {selectedLeadId ? "✓ Linked to Lead" : "• Standalone Proposal"}
                  </span>
                </div>
              </div>
            )}

            {/* Proposal & Reference Details */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Quotation Reference &amp; Proposal Subject
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Ref. No.
                    </label>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          refetchQuotations();
                          setRefNo(autoNextRefNo);
                          toast.info(`Next sequential reference number: ${autoNextRefNo}`);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                        title="Recalculate next sequential reference number"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Auto Pick
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    placeholder="e.g. Q-1001"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-mono font-bold text-blue-600"
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Quotation Date
                    </label>
                    <input
                      type="date"
                      value={quotationDate}
                      onChange={(e) => setQuotationDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>Validity Date (Valid Until)</span>
                      <span className="text-[10px] text-blue-600 font-bold dark:text-blue-400">Below Date</span>
                    </label>
                    <input
                      type="date"
                      value={validityEndDate}
                      onChange={(e) => handleValidityEndDateChange(e.target.value)}
                      className="w-full rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Validity (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-bold"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Defaults to 15 days validity</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subject / Title
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Offer For Medical Equipment"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Customer Details */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                Customer / Recipient Information
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Customer Name / M/s. <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. M/s. Apex Super Specialty Hospital"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Customer Ref <span className="text-[10px] text-slate-400 font-normal">(Enquiry / PO Ref)</span>
                  </label>
                  <input
                    type="text"
                    value={customerRef}
                    onChange={(e) => setCustomerRef(e.target.value)}
                    placeholder="e.g. PO-9876 / ENQ-123"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kind Attn (Contact Person)
                  </label>
                  <input
                    type="text"
                    value={kindAttn}
                    onChange={(e) => setKindAttn(e.target.value)}
                    placeholder="e.g. Dr. Rajesh Sharma"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phone / Tel.
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Office Landline / Phone"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mobile / Cell
                  </label>
                  <input
                    type="text"
                    value={cell}
                    onChange={(e) => setCell(e.target.value)}
                    placeholder="Mobile Number"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="customer@email.com"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 03ABCDE1234F1Z5"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>

                <div className="sm:col-span-2 md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="Building / Street Address"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 sm:col-span-3 md:col-span-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Pincode
                    </label>
                    <input
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="Pincode"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-blue-600" />
                  Line Items &amp; Products ({items.length})
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Product
                </button>
              </div>

              <div className="space-y-3">
                {items.map((it, idx) => {
                  const comp = calculations.items[idx];
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-slate-800/40"
                    >
                      <div className="grid grid-cols-12 gap-2 items-end">
                        {/* Sr & Product Selector */}
                        <div className="col-span-12 sm:col-span-4">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                              {idx + 1}
                            </span>
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              Product Description <span className="text-rose-500">*</span>
                            </label>
                          </div>

                          {products.length > 0 && (
                            <select
                              value={it.product || ""}
                              onChange={(e) => handleSelectProduct(idx, e.target.value)}
                              className="mb-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                            >
                              <option value="">-- Autofill from Catalog --</option>
                              {products.map((p) => (
                                <option key={p._id} value={p._id}>
                                  {p.product_name} ({p.sku || "SKU"})
                                </option>
                              ))}
                            </select>
                          )}

                          <input
                            type="text"
                            required
                            value={it.product_name}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, product_name: e.target.value } : x))
                              )
                            }
                            placeholder="Enter item name..."
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                          />
                        </div>

                        {/* HSN */}
                        <div className="col-span-4 sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            HSN/SAC
                          </label>
                          <input
                            type="text"
                            value={it.hsn_code}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, hsn_code: e.target.value } : x))
                              )
                            }
                            placeholder="9018"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white font-mono"
                          />
                        </div>

                        {/* QTY & Unit */}
                        <div className="col-span-4 sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Qty &amp; Unit
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x))
                                )
                              }
                              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                            />
                            <input
                              type="text"
                              value={it.unit}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x))
                                )
                              }
                              placeholder="Nos"
                              className="w-14 rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                            />
                          </div>
                        </div>

                        {/* Rate */}
                        <div className="col-span-4 sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Rate (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.rate}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, rate: Number(e.target.value) } : x))
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                          />
                        </div>

                        {/* GST % */}
                        <div className="col-span-3 sm:col-span-1">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            GST %
                          </label>
                          <select
                            value={it.gst_rate}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, gst_rate: Number(e.target.value) } : x))
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-xs font-semibold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                          >
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                            <option value={12}>12%</option>
                            <option value={18}>18%</option>
                            <option value={28}>28%</option>
                          </select>
                        </div>

                        {/* Delete Row */}
                        <div className="col-span-1 sm:col-span-1 flex justify-end pb-1">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Line breakdown */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2 text-[11px] text-slate-600 dark:border-white/5 dark:text-slate-400">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                              )
                            }
                            placeholder="Optional technical specifications / extra notes..."
                            className="w-full bg-transparent border-0 border-b border-dashed border-slate-300 py-0.5 text-[11px] focus:border-blue-500 focus:outline-none dark:border-slate-700"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span>
                            Subtotal: <strong>{formatCurrencyINR(comp?.taxable || 0)}</strong>
                          </span>
                          <span>
                            GST: <strong>{formatCurrencyINR(comp?.gstAmt || 0)}</strong>
                          </span>
                          <span className="text-blue-700 dark:text-blue-400 font-bold">
                            Total: {formatCurrencyINR(comp?.lineTotal || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Totals Summary Box */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                    Grand Total Summary
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Taxable Subtotal + Applicable GST (CGST/SGST or IGST)
                  </div>
                </div>

                <div className="space-y-1 text-right text-xs">
                  <div className="text-slate-600 dark:text-slate-300">
                    Taxable Sub Total: <strong>{formatCurrencyINR(calculations.subtotal)}</strong>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    Total GST Amount: <strong>{formatCurrencyINR(calculations.totalGst)}</strong>
                  </div>
                  <div className="text-base font-extrabold text-blue-900 dark:text-blue-200 pt-1 border-t border-blue-200 dark:border-blue-900/40">
                    Grand Total: {formatCurrencyINR(calculations.grandTotal)}
                  </div>
                </div>
              </div>
            </div>

            {/* Signatory / Admin Representative Section */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10 bg-slate-50/40 dark:bg-slate-900/40">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-xs uppercase tracking-wider">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    Signatory &amp; Admin Representative (Printed on PDF Letterhead)
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Select an assigned admin user or enter representative contact details printed at the bottom of the proposal.
                  </p>
                </div>

                {/* Quick selector for admin/finance/signatory users */}
                {usersList.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Quick Pick Signatory:
                    </label>
                    <select
                      onChange={(e) => handleSelectAdminUser(e.target.value)}
                      defaultValue=""
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-xs dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Select Signatory User --
                      </option>
                      {lead?.assigned_to &&
                        typeof lead.assigned_to === "object" &&
                        ["admin", "super_admin", "finance"].includes(lead.assigned_to.department || "") && (
                          <option value={lead.assigned_to._id}>
                            ⭐ Assigned: {lead.assigned_to.name} ({lead.assigned_to.department})
                          </option>
                        )}
                      {adminUsers.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name} ({u.department}) {u.phone ? `• ${u.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Signatory Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    placeholder="e.g. Puneet Oberoi"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Designation / Title
                  </label>
                  <input
                    type="text"
                    value={signatoryDesignation}
                    onChange={(e) => setSignatoryDesignation(e.target.value)}
                    placeholder="e.g. Director / Authorized Signatory"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Contact Phone / Mobile
                  </label>
                  <input
                    type="text"
                    value={signatoryPhone}
                    onChange={(e) => setSignatoryPhone(e.target.value)}
                    placeholder="e.g. +91 92168 11111"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Official Email
                  </label>
                  <input
                    type="email"
                    value={signatoryEmail}
                    onChange={(e) => setSignatoryEmail(e.target.value)}
                    placeholder="e.g. admin@medicaent.in"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Terms & Conditions Section */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    General Terms &amp; Conditions ({terms.length} Points)
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Select multiple master terms sets or edit individual condition lines printed on official proposals.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetTerms}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                    title="Reset to default standard conditions"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset Default
                  </button>
                  <button
                    type="button"
                    onClick={handleAddTerm}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    Add Condition
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTerms((p) => !p)}
                    className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 ml-1 cursor-pointer"
                  >
                    {showTerms ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {showTerms && (
                <div className="mt-4 space-y-4">
                  {/* Master Terms Sets Multi-Selector Panel */}
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-blue-600" />
                        Select Terms &amp; Conditions Sets ({selectedSetIds.length} Selected)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllSets}
                          className="text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <button
                          type="button"
                          onClick={handleDeselectAllSets}
                          className="text-[10px] font-semibold text-slate-500 hover:underline dark:text-slate-400 cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {masterTermsSets.length === 0 ? (
                      <div className="text-xs text-slate-500 py-1">
                        No master terms sets found in database. You can add custom condition lines below.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {masterTermsSets.map((set) => {
                          const isChecked = selectedSetIds.includes(set._id);
                          const lineCount = set.terms_text?.length || 0;
                          return (
                            <button
                              key={set._id}
                              type="button"
                              onClick={() => handleToggleTermsSet(set._id)}
                              className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition cursor-pointer ${
                                isChecked
                                  ? "border-blue-500 bg-white dark:bg-slate-900 shadow-2xs text-blue-900 dark:text-white"
                                  : "border-slate-200 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              <div className="mt-0.5 shrink-0 text-blue-600">
                                {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-slate-400" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold truncate flex items-center gap-1">
                                  {set.title}
                                  {set.is_default && (
                                    <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {lineCount} {lineCount === 1 ? "line" : "lines"} • <span className="uppercase">{set.type}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Individual Condition Lines Editor */}
                  <div className="space-y-3">
                    {terms.map((term, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 transition focus-within:border-blue-300 dark:border-white/10 dark:bg-slate-800/40"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300 mt-1">
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <RichTextEditor
                            value={term}
                            onChange={(html) => handleTermChange(idx, html)}
                            placeholder={`Condition Line ${idx + 1}...`}
                            minHeight="50px"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveTerm(idx)}
                          className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 cursor-pointer mt-1"
                          title="Delete Condition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    {terms.length === 0 && (
                      <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl p-4 dark:border-white/10">
                        No condition lines selected or defined. Select master terms sets above or click &apos;+ Add Condition&apos;.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-white/10 dark:bg-slate-900">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || isUpdating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              {isCreating || isUpdating ? "Saving..." : isEditing ? "Update Quotation" : "Generate Quotation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
