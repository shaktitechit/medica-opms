/**
 * @fileoverview Create and Edit Lead Form page with duplicate detection, product requirement builder, and master selects.
 * @module components/portal/shared/leads/LeadFormPage
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Package,
  Layers,
  FileText,
  ExternalLink,
  X,
  Search,
  Check,
} from "lucide-react";
import {
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useGetLeadQuery,
  useCheckLeadDuplicatesMutation,
  useListLeadSourcesQuery,
  useListUsersQuery,
  useListProductsQuery,
  type LeadPriority,
  type LeadProductItem,
  type LeadContactItem,
  type LeadInputPayload,
  type DuplicateCheckResult,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { useAppSelector } from "@/store/hooks";
import { isLeadAdmin } from "./leadUtils";

type Props = {
  mode: "create" | "edit";
  leadId?: string;
  portalHome?: string;
};

type CatalogProduct = {
  _id: string;
  product_name: string;
  sku?: string;
  brand?: string;
  base_price?: number;
  unit?: string;
  product_group?: string;
};

interface ProductAutocompleteProps {
  products: CatalogProduct[];
  selectedId: string;
  onChange: (id: string, product?: CatalogProduct) => void;
  placeholder?: string;
  className?: string;
}

function ProductAutocomplete({
  products,
  selectedId,
  onChange,
  placeholder = "Search catalog product...",
  className = "w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white",
}: ProductAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    return products.find((p) => String(p._id) === String(selectedId));
  }, [products, selectedId]);

  useEffect(() => {
    if (selectedProduct) {
      const name = String(selectedProduct.product_name || "");
      const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
      setSearch(`${name}${sku}`);
    } else {
      setSearch("");
    }
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products.slice(0, 50);
    return products
      .filter((p) => {
        const name = String(p.product_name || "").toLowerCase();
        const sku = String(p.sku || "").toLowerCase();
        const brand = String(p.brand || "").toLowerCase();
        const group = String(p.product_group || "").toLowerCase();
        return name.includes(q) || sku.includes(q) || brand.includes(q) || group.includes(q);
      })
      .slice(0, 50);
  }, [products, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          const name = String(selectedProduct.product_name || "");
          const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
          setSearch(`${name}${sku}`);
        } else {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedProduct]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
          placeholder={placeholder}
          className={`${className} pr-7`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="h-3.5 w-3.5" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              No matching products in catalog
            </div>
          ) : (
            filtered.map((p) => {
              const id = String(p._id);
              const sku = p.sku ? ` (${p.sku})` : "";
              const brand = p.brand ? ` • ${p.brand}` : "";
              const price = p.base_price ? ` • ₹${p.base_price}` : "";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(id, p);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {p.product_name}
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      {sku}
                      {brand}
                      {price}
                    </span>
                  </div>
                  {String(selectedId) === id && (
                    <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const DEFAULT_SOURCES = [
  "Website",
  "IndiaMART",
  "TradeIndia",
  "Direct Inquiry",
  "Phone Call",
  "Email",
  "Referral",
  "Existing Customer",
  "Sales Executive",
  "Exhibition",
  "Walk-in",
  "Other",
];

export function LeadFormPage({ mode, leadId, portalHome = "/admin" }: Props) {
  const router = useRouter();
  const authUser = useAppSelector((state) => state.auth.user);
  const isAdmin = isLeadAdmin(authUser, portalHome);
  const isSales = !isAdmin;

  // Fetch lead data if edit mode
  const { data: existingLead, isLoading: loadingLead } = useGetLeadQuery(
    leadId || "",
    { skip: mode !== "edit" || !leadId }
  );

  const { data: sourcesData } = useListLeadSourcesQuery();
  const { data: usersData } = useListUsersQuery();;
  const { data: productsData } = useListProductsQuery({ limit: "100" });

  const [createLead, { isLoading: creating }] = useCreateLeadMutation();
  const [updateLead, { isLoading: updating }] = useUpdateLeadMutation();
  const [checkDuplicates] = useCheckLeadDuplicatesMutation();

  // Form State
  const [name, setName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [alternatePhone, setAlternatePhone] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");
  const [designation, setDesignation] = useState<string>("");

  const [addressLine1, setAddressLine1] = useState<string>("");
  const [addressLine2, setAddressLine2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [pincode, setPincode] = useState<string>("");
  const [country, setCountry] = useState<string>("India");

  const [requirement, setRequirement] = useState<string>("");
  const [estimatedValue, setEstimatedValue] = useState<number | "">("");
  const [expectedClosingDate, setExpectedClosingDate] = useState<string>("");

  const [source, setSource] = useState<string>("Website");
  const [priority, setPriority] = useState<LeadPriority>("medium");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [products, setProducts] = useState<LeadProductItem[]>([]);
  const [contacts, setContacts] = useState<LeadContactItem[]>([]);

  // Duplicate Warning State
  const [dupResult, setDupResult] = useState<DuplicateCheckResult | null>(null);

  // Populate state on edit
  useEffect(() => {
    if (existingLead && mode === "edit") {
      setName(existingLead.name || "");
      setCompanyName(existingLead.company_name || "");
      setPhone(existingLead.phone || "");
      setEmail(existingLead.email || "");
      setAlternatePhone(existingLead.alternate_phone || "");
      setIndustry(existingLead.industry || "");
      setDesignation(existingLead.designation || "");

      if (existingLead.billing_address) {
        setAddressLine1(existingLead.billing_address.address_line_1 || "");
        setAddressLine2(existingLead.billing_address.address_line_2 || "");
        setCity(existingLead.billing_address.city || "");
        setState(existingLead.billing_address.state || "");
        setPincode(existingLead.billing_address.pincode || "");
        setCountry(existingLead.billing_address.country || "India");
      }

      setRequirement(existingLead.requirement || "");
      setEstimatedValue(existingLead.estimated_value ?? "");
      if (existingLead.expected_closing_date) {
        setExpectedClosingDate(existingLead.expected_closing_date.split("T")[0]);
      }

      setSource(existingLead.source || "Website");
      setPriority(existingLead.priority || "medium");
      setAssignedTo(
        typeof existingLead.assigned_to === "object"
          ? existingLead.assigned_to._id
          : existingLead.assigned_to || ""
      );
      setTagsInput(Array.isArray(existingLead.tags) ? existingLead.tags.join(", ") : "");
      setNotes(existingLead.notes || "");

      if (Array.isArray(existingLead.products) && existingLead.products.length > 0) {
        setProducts(
          existingLead.products.map((p) => ({
            product: typeof p.product === "object" ? p.product._id : p.product,
            product_name: p.product_name,
            quantity: p.quantity || 1,
            target_price: p.target_price || 0,
            unit: p.unit || "pcs",
            remarks: p.remarks || "",
          }))
        );
      }

      if (Array.isArray(existingLead.contacts) && existingLead.contacts.length > 0) {
        setContacts(
          existingLead.contacts.map((c) => ({
            _id: c._id,
            name: c.name || "",
            department: c.department || "",
            designation: c.designation || "",
            phone: c.phone || "",
            email: c.email || "",
            alternate_phone: c.alternate_phone || "",
            is_primary: Boolean(c.is_primary),
          }))
        );
      }
    }
  }, [existingLead, mode]);

  // Duplicate Check Handler
  const triggerDuplicateCheck = async () => {
    if (mode === "edit") return; // Skip in edit mode
    if (!phone && !email && !companyName) return;

    try {
      const res = await checkDuplicates({
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company_name: companyName.trim() || undefined,
      }).unwrap();

      if (res.has_duplicates) {
        setDupResult(res);
      } else {
        setDupResult(null);
      }
    } catch (_err) {
      // Best effort check
    }
  };

  const users = Array.isArray(usersData)
    ? usersData
    : (usersData as { data?: Array<{ _id: string; name: string; department?: string }> })?.data || [];
  const salesUsers = users.filter((u) => u.department === "sales" || u.department === "admin");

  const sourcesList =
    Array.isArray(sourcesData) && sourcesData.length > 0
      ? sourcesData.map((s) => s.name)
      : DEFAULT_SOURCES;

  const catalogProducts: CatalogProduct[] = useMemo(() => {
    if (Array.isArray(productsData)) return productsData as CatalogProduct[];
    if (productsData && typeof productsData === "object") {
      if ("items" in productsData && Array.isArray((productsData as { items: unknown }).items)) {
        return (productsData as { items: CatalogProduct[] }).items;
      }
      if ("data" in productsData && Array.isArray((productsData as { data: unknown }).data)) {
        return (productsData as { data: CatalogProduct[] }).data;
      }
    }
    return [];
  }, [productsData]);

  // Product Row Management
  const handleAddProduct = () => {
    setProducts((prev) => [
      ...prev,
      {
        product_name: "",
        quantity: 1,
        target_price: 0,
        unit: "pcs",
        remarks: "",
      },
    ]);
  };

  const handleQuickAddProduct = (productId: string, productObj?: CatalogProduct) => {
    const found = productObj || catalogProducts.find((p) => p._id === productId);
    if (!found) return;

    setProducts((prev) => [
      ...prev,
      {
        product: found._id,
        product_name: found.product_name,
        quantity: 1,
        target_price: 0,
        unit: found.unit || "pcs",
        remarks: "",
      },
    ]);

    toast.success(`Added "${found.product_name}" to requirements`);
  };

  const handleProductSelect = (idx: number, productId: string, productObj?: CatalogProduct) => {
    const found = productObj || catalogProducts.find((p) => p._id === productId);
    if (!found) {
      setProducts((prev) => {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          product: undefined,
        };
        return copy;
      });
      return;
    }

    setProducts((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        product: found._id,
        product_name: found.product_name,
        target_price: 0,
        unit: found.unit || copy[idx].unit || "pcs",
      };
      return copy;
    });
  };

  const handleProductChange = (
    idx: number,
    field: keyof LeadProductItem,
    val: unknown
  ) => {
    setProducts((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleRemoveProduct = (idx: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddContact = () => {
    setContacts((prev) => [
      ...prev,
      {
        name: "",
        designation: "",
        department: "",
        phone: "",
        email: "",
        alternate_phone: "",
        is_primary: false,
      },
    ]);
  };

  const handleContactChange = (
    idx: number,
    field: keyof LeadContactItem,
    val: unknown
  ) => {
    setContacts((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleRemoveContact = (idx: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSetAsPrimary = (idx: number) => {
    const target = contacts[idx];
    if (!target) return;

    // Save current primary into contacts list, replace primary with clicked contact
    const oldPrimary: LeadContactItem = {
      name: name,
      designation: designation,
      phone: phone,
      email: email,
      alternate_phone: alternatePhone,
      is_primary: false,
    };

    setName(target.name || "");
    setDesignation(target.designation || "");
    setPhone(target.phone || "");
    setEmail(target.email || "");
    setAlternatePhone(target.alternate_phone || "");

    setContacts((prev) => {
      const copy = [...prev];
      if (oldPrimary.name || oldPrimary.phone || oldPrimary.email) {
        copy[idx] = oldPrimary;
      } else {
        copy.splice(idx, 1);
      }
      return copy;
    });

    toast.success(`Set ${target.name || "Contact"} as Primary Contact`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Contact name is required");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      toast.error("Please provide at least a phone number or email address");
      return;
    }

    const authUserId = authUser?._id ? String(authUser._id) : authUser?.id ? String(authUser.id) : undefined;
    const effectiveAssignedTo = isSales
      ? (mode === "create" ? authUserId : undefined)
      : (assignedTo || undefined);

    const payload: LeadInputPayload = {
      name: name.trim(),
      company_name: companyName.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      alternate_phone: alternatePhone.trim() || undefined,
      industry: industry.trim() || undefined,
      designation: designation.trim() || undefined,
      billing_address: {
        address_line_1: addressLine1.trim() || undefined,
        address_line_2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        country: country.trim() || "India",
      },
      requirement: requirement.trim() || undefined,
      estimated_value: estimatedValue !== "" ? Number(estimatedValue) : 0,
      expected_closing_date: expectedClosingDate ? expectedClosingDate : undefined,
      source: source.trim(),
      priority,
      assigned_to: effectiveAssignedTo,
      contacts: contacts
        .filter((c) => c.name?.trim() || c.phone?.trim() || c.email?.trim())
        .map((c) => ({
          name: c.name.trim(),
          department: c.department?.trim() || undefined,
          designation: c.designation?.trim() || undefined,
          phone: c.phone?.trim() || undefined,
          email: c.email?.trim() || undefined,
          alternate_phone: c.alternate_phone?.trim() || undefined,
          is_primary: Boolean(c.is_primary),
        })),
      products: products.filter((p) => p.product_name.trim()),
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
    };

    try {
      if (mode === "create") {
        const created = await createLead(payload).unwrap();
        toast.success(`Lead #${created.lead_no} created successfully`);
        router.push(`${portalHome}/leads/${created._id}`);
      } else if (leadId) {
        const updated = await updateLead({ id: leadId, body: payload }).unwrap();
        toast.success(`Lead #${updated.lead_no} updated successfully`);
        router.push(`${portalHome}/leads/${updated._id}`);
      }
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="relative min-h-screen space-y-6 pb-20">
      <PortalBusyOverlay active={creating || updating || loadingLead} />

      {/* Header Banner */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`${portalHome}/leads`}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {mode === "create" ? "Create New Lead" : `Edit Lead #${existingLead?.lead_no}`}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === "create"
                  ? "Capture sales lead details, requirements, and assign owner"
                  : "Update lead contact info, requirements and pipeline properties"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={creating || updating}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Save className="h-4 w-4" />
            {mode === "create" ? "Save & Create Lead" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Duplicate Warning Banner */}
      {dupResult && dupResult.has_duplicates && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                Potential Duplicate Records Detected
              </h4>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                We found matching records with identical phone, email, or company name. You may still proceed if this is a distinct lead.
              </p>

              {dupResult.matching_leads.length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    Existing Leads:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {dupResult.matching_leads.map((l) => (
                      <Link
                        key={l._id}
                        href={`${portalHome}/leads/${l._id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white/80 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-white dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      >
                        #{l.lead_no} - {l.name} ({l.status})
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {dupResult.matching_parties.length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    Existing Customers in Master:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white/80 px-2 py-1 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    >
                      {dupResult.matching_parties.map((p) => (
                        <span
                          key={p._id}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white/80 px-2 py-1 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        >
                          {p.party_name} ({p.mobile || p.email || p.district})
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDupResult(null)}
              className="text-amber-500 hover:text-amber-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Form Grid */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Information */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              1. Lead & Contact Information
            </h2>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Contact Person Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Rajesh Sharma"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Company / Hospital / Facility
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onBlur={triggerDuplicateCheck}
                placeholder="Apollo Hospital / MediCare Clinic"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Designation / Role
              </label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Medical Superintendent / Purchase Head"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Industry / Domain
              </label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Healthcare, Diagnostics, Pharma..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Primary Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={triggerDuplicateCheck}
                placeholder="+91 98765 43210"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={triggerDuplicateCheck}
                placeholder="contact@hospital.com"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Alternate Phone
              </label>
              <input
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="+91 22 1234 5678"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Multiple Additional Contacts Section */}
          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Additional Contact Persons ({contacts.length})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Manage secondary decision makers, purchase managers, department heads, or technical contacts.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddContact}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Contact Person
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-white/10">
                No additional contacts added. Click &quot;Add Contact Person&quot; to add secondary contacts.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {contacts.map((c, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-all dark:border-white/10 dark:bg-slate-800/30"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-white/5">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Contact Person #{idx + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleSetAsPrimary(idx)}
                          className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          title="Swap with primary contact above"
                        >
                          Set as Primary
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveContact(idx)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          title="Remove Contact"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => handleContactChange(idx, "name", e.target.value)}
                          placeholder="Dr. S. Mehta"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Designation / Role
                        </label>
                        <input
                          type="text"
                          value={c.designation || ""}
                          onChange={(e) => handleContactChange(idx, "designation", e.target.value)}
                          placeholder="Head of Radiology"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Department
                        </label>
                        <input
                          type="text"
                          value={c.department || ""}
                          onChange={(e) => handleContactChange(idx, "department", e.target.value)}
                          placeholder="Purchase / Radiology"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={c.phone || ""}
                          onChange={(e) => handleContactChange(idx, "phone", e.target.value)}
                          placeholder="+91 98765 00000"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={c.email || ""}
                          onChange={(e) => handleContactChange(idx, "email", e.target.value)}
                          placeholder="smehta@hospital.com"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Location */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              2. Location & Address
            </h2>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Address Line 1
              </label>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Plot 45, Sector 18"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                City / District
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Mumbai"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Maharashtra"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Pincode
              </label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="400001"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Product Requirements */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                3. Products & Requirements
              </h2>
            </div>
            <button
              type="button"
              onClick={handleAddProduct}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Custom Line
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Requirement Description
              </label>
              <textarea
                rows={2}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                placeholder="High-level description of client needs, specifications, or tender details..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Quick Search & Add from Catalog Bar */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 dark:border-blue-900/30 dark:bg-blue-950/20">
              <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1.5 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Quick Search & Add Product from Catalog
              </div>
              <ProductAutocomplete
                products={catalogProducts}
                selectedId=""
                onChange={(id, p) => handleQuickAddProduct(id, p)}
                placeholder="Type product name, SKU, or brand to add directly..."
                className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {/* Product items table */}
            {products.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 min-w-[220px]">Catalog Product Search</th>
                      <th className="px-3 py-2 min-w-[180px]">Requirement Item Name</th>
                      <th className="px-3 py-2 w-28">Required Qty</th>
                      <th className="px-3 py-2 w-24">Unit</th>
                      <th className="px-3 py-2 text-right w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {products.map((item, idx) => {
                      const selProdId =
                        typeof item.product === "object"
                          ? (item.product as { _id?: string })?._id || ""
                          : item.product || "";
                      return (
                        <tr key={idx}>
                          <td className="p-2">
                            <ProductAutocomplete
                              products={catalogProducts}
                              selectedId={selProdId}
                              onChange={(id, p) => handleProductSelect(idx, id, p)}
                              placeholder="Search catalog item..."
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              value={item.product_name}
                              onChange={(e) =>
                                handleProductChange(idx, "product_name", e.target.value)
                              }
                              placeholder="Product name..."
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleProductChange(
                                  idx,
                                  "quantity",
                                  Number(e.target.value) || 1
                                )
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.unit || "pcs"}
                              onChange={(e) =>
                                handleProductChange(idx, "unit", e.target.value)
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(idx)}
                              title="Remove item"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Total Required Quantity (Auto Sum)
                </label>
                <div className="mt-1.5 flex items-center h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-white/10 dark:bg-slate-800/50 dark:text-white">
                  {products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0).toLocaleString()} Units / Items
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Expected Closing Date
                </label>
                <input
                  type="date"
                  value={expectedClosingDate}
                  onChange={(e) => setExpectedClosingDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Management & Ownership */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              4. Lead Management & Assignment
            </h2>
          </div>

          <div className={`mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 ${isSales ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lead Source <span className="text-rose-500">*</span>
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              >
                {sourcesList.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as LeadPriority)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {!isSales && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Assign to Sales User
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Leave unassigned...</option>
                  {salesUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="vip, urgent-tender, solar"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Notes */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              5. Internal Notes & Remarks
            </h2>
          </div>

          <div className="mt-4">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal comments, previous relationship history, or meeting highlights..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`${portalHome}/leads`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={creating || updating}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Save className="h-4 w-4" />
            {mode === "create" ? "Save & Create Lead" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
