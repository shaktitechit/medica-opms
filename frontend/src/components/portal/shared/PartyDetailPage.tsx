"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Edit,
  ArrowLeft,
  Building,
  MapPin,
  Phone,
  Mail,
  User,
  CreditCard,
  FileText,
  Package,
  Layers,
  Plus,
  Trash2,
  Check,
  X,
  Search,
  Settings,
  Calendar,
  DollarSign,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import {
  useGetPartyQuery,
  useListPartyProductsQuery,
  useCreatePartyProductMutation,
  usePatchPartyProductMutation,
  useDeletePartyProductMutation,
  useAddPartyProductRateMutation,
  useUpdatePartyProductRateMutation,
  useDeletePartyProductRateMutation,
  useApprovePartyProductRateMutation,
  useListProductsQuery,
} from "@/store/api";
import { PartyDetailModal } from "./PartyDetailModal";
import { toast } from "@/lib/toast";
import { mutationSuccessCopy, mutationRejectedMessage } from "@/lib/mutationMessages";

export type PartyDetailPageProps = {
  id: string;
  portalHome: string;
};

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
const valueClass = "text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5";

export default function PartyDetailPage({ id, portalHome }: PartyDetailPageProps) {
  const router = useRouter();
  const portal = portalHome.replace("/", ""); // e.g. "admin" or "finance"

  // Queries
  const { data: rawParty, isFetching, isError, refetch } = useGetPartyQuery(id, {
    skip: !id,
  });

  // Modal & Tab states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "addresses" | "products">("profile");

  // Party-Product Mappings State
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMappingId, setExpandedMappingId] = useState<string | null>(null);

  // Modals for Products & Rates
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [editMappingTarget, setEditMappingTarget] = useState<any | null>(null);
  const [addRateTarget, setAddRateTarget] = useState<any | null>(null);
  const [editRateTarget, setEditRateTarget] = useState<{ mapping: any; rate: any } | null>(null);
  const [deleteMappingTarget, setDeleteMappingTarget] = useState<any | null>(null);
  const [deleteRateTarget, setDeleteRateTarget] = useState<{ mappingId: string; rateId: string; rateLabel: string } | null>(null);

  // Queries
  const { data: rawMappings, isLoading: isMappingsLoading } = useListPartyProductsQuery();

  // Mutations
  const [createMapping, { isLoading: isCreating }] = useCreatePartyProductMutation();
  const [patchMapping, { isLoading: isPatching }] = usePatchPartyProductMutation();
  const [deleteMapping, { isLoading: isDeleting }] = useDeletePartyProductMutation();
  const [addRate, { isLoading: isAddingRate }] = useAddPartyProductRateMutation();
  const [updateRate, { isLoading: isUpdatingRate }] = useUpdatePartyProductRateMutation();
  const [deleteRate, { isLoading: isDeletingRate }] = useDeletePartyProductRateMutation();
  const [approveRate] = useApprovePartyProductRateMutation();

  const partyMappings = useMemo(() => {
    if (!Array.isArray(rawMappings)) return [];
    return rawMappings.filter((m: any) => {
      const pId = typeof m.party === "object" ? m.party?._id || m.party?.id : m.party;
      return String(pId) === String(id);
    });
  }, [rawMappings, id]);

  const filteredMappings = useMemo(() => {
    if (!searchQuery.trim()) return partyMappings;
    const q = searchQuery.toLowerCase();
    return partyMappings.filter((m: any) => {
      const productName = m.product?.product_name || "";
      const sku = m.product?.sku || "";
      return productName.toLowerCase().includes(q) || sku.toLowerCase().includes(q);
    });
  }, [partyMappings, searchQuery]);

  const mappedProductIds = useMemo(() => {
    return partyMappings.map((m: any) => {
      return typeof m.product === "object" ? m.product?._id || m.product?.id : m.product;
    });
  }, [partyMappings]);

  // Theme selection: emerald/teal for finance, violet/purple for admin
  const isFinance = portal === "finance";
  const gradientClass = isFinance
    ? "from-emerald-500/10 to-teal-500/10 border-emerald-500/10 dark:from-emerald-500/5 dark:to-teal-500/5"
    : "from-violet-500/10 to-purple-500/10 border-violet-500/10 dark:from-violet-500/5 dark:to-purple-500/5";
  const badgeClass = isFinance
    ? "bg-emerald-50 text-emerald-700 ring-emerald-700/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
    : "bg-violet-50 text-violet-700 ring-violet-700/10 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20";
  const portalName = isFinance ? "Finance Portal" : "Admin Portal";

  if (isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading party profile...</p>
      </div>
    );
  }

  if (isError || !rawParty) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="text-4xl">⚠️</div>
        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Failed to load party details</h2>
        <p className="mt-2 text-sm text-slate-550 dark:text-slate-400">
          The requested profile may not exist, or there might be an issue connecting to the database.
        </p>
        <button
          onClick={() => router.push(`${portalHome}/parties`)}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Parties
        </button>
      </div>
    );
  }

  const p = rawParty as any;
  const bAddr = p.billing_address || {};
  const sAddr = p.shipping_address || {};

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Edit Modal popup */}
      {isEditModalOpen && (
        <PartyDetailModal
          partyId={id}
          onClose={() => {
            setIsEditModalOpen(false);
            refetch();
          }}
        />
      )}

      {/* Header Banner */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r border p-6 shadow-sm ${gradientClass}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">
                {portalName}
              </span>
              <span className="text-xs font-medium text-slate-550 dark:text-slate-400">Party Profile</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
                {p.party_name || "Untitled Party"}
              </h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset capitalize ${badgeClass}`}>
                {p.party_type}
              </span>
              {p.is_active !== false ? (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs font-medium bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => router.push(`${portalHome}/parties`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-880 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" /> Back to List
            </button>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Edit className="h-4 w-4" /> Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "profile"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Building className="h-4 w-4" /> Profile & Licenses
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("addresses")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "addresses"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <MapPin className="h-4 w-4" /> Address details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("products")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "products"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Layers className="h-4 w-4" /> Products & Rates
        </button>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-6">
        {activeTab === "profile" && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-6">
            <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <User className="h-5 w-5 text-blue-500" /> Basic Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Party Name */}
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Party Name</label>
                <div className={valueClass}>{p.party_name || "—"}</div>
              </div>

              {/* Party Type */}
              <div className="space-y-1">
                <label className={labelClass}>Party Type</label>
                <div className={`${valueClass} capitalize`}>{p.party_type || "—"}</div>
              </div>

              {/* Contact Person */}
              <div className="space-y-1">
                <label className={labelClass}>Contact Person</label>
                <div className={valueClass}>{p.contact_person || "—"}</div>
              </div>

              {/* Mobile */}
              <div className="space-y-1">
                <label className={labelClass}>Mobile Number</label>
                <div className={`${valueClass} flex items-center gap-1.5`}>
                  {p.mobile ? (
                    <>
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {p.mobile}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className={labelClass}>Email Address</label>
                <div className={`${valueClass} flex items-center gap-1.5`}>
                  {p.email ? (
                    <>
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {p.email}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>

            <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pt-4 pb-3">
              <FileText className="h-5 w-5 text-blue-500" /> Compliance & Terms
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* GSTIN */}
              <div className="space-y-1">
                <label className={labelClass}>GSTIN</label>
                <div className={`${valueClass} font-mono uppercase tracking-wider`}>
                  {p.gst_no || "—"}
                </div>
              </div>

              {/* Drug License */}
              <div className="space-y-1">
                <label className={labelClass}>Drug License No</label>
                <div className={valueClass}>{p.drug_license_no || "—"}</div>
              </div>

              {/* District */}
              <div className="space-y-1">
                <label className={labelClass}>District</label>
                <div className={valueClass}>{p.district || "—"}</div>
              </div>

              {/* State */}
              <div className="space-y-1">
                <label className={labelClass}>State</label>
                <div className={valueClass}>{p.state || "—"}</div>
              </div>

              {/* Payment Terms */}
              <div className="space-y-1">
                <label className={labelClass}>Payment Terms</label>
                <div className={`${valueClass} flex items-center gap-1.5`}>
                  <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                  {p.payment_terms || "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "addresses" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Billing Address Card */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
              <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
                <Building className="h-4.5 w-4.5 text-blue-500" /> Billing Address
              </h3>
              <div className="space-y-3.5 text-sm text-slate-700 dark:text-slate-350">
                <p className="font-semibold text-slate-900 dark:text-slate-50">
                  {bAddr.address_line_1 || "—"}
                </p>
                {bAddr.address_line_2 && (
                  <p>{bAddr.address_line_2}</p>
                )}
                <p>
                  {[
                    bAddr.city,
                    bAddr.state,
                    bAddr.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                {bAddr.country && (
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
                    {bAddr.country}
                  </p>
                )}
              </div>
            </div>

            {/* Shipping Address Card */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
              <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
                <MapPin className="h-4.5 w-4.5 text-blue-500" /> Shipping Address
              </h3>
              <div className="space-y-3.5 text-sm text-slate-700 dark:text-slate-350">
                <p className="font-semibold text-slate-900 dark:text-slate-50">
                  {sAddr.address_line_1 || "—"}
                </p>
                {sAddr.address_line_2 && (
                  <p>{sAddr.address_line_2}</p>
                )}
                <p>
                  {[
                    sAddr.city,
                    sAddr.state,
                    sAddr.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                {sAddr.country && (
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
                    {sAddr.country}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "products" && (
          <div className="space-y-6">
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-sm">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search mapped products by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsMapModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition shrink-0 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                <Plus className="h-4 w-4" /> Map New Product
              </button>
            </div>

            {/* Mappings display */}
            {isMappingsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading mappings...</p>
              </div>
            ) : partyMappings.length === 0 ? (
              /* Empty state */
              <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-slate-900">
                <Layers className="h-12 w-12 mx-auto text-slate-400" />
                <h3 className="mt-4 text-sm font-bold text-slate-905 dark:text-slate-105">No products mapped</h3>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  This party doesn't have any custom catalog mappings or negotiated rates yet.
                </p>
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(true)}
                  className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  <Plus className="h-4 w-4" /> Map a Product
                </button>
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  No mapped products match "{searchQuery}"
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMappings.map((m: any) => {
                  const isExpanded = expandedMappingId === m._id;
                  return (
                    <div
                      key={m._id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200"
                    >
                      {/* Product Header */}
                      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
                            <Package className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                              {m.product?.product_name || "Unknown Product"}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs font-mono bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                                SKU: {m.product?.sku || "—"}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Base: ₹{m.product?.base_price ?? "—"}
                              </span>
                              <span className="text-xs text-slate-400 dark:text-slate-500">|</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Min Sale: ₹{m.product?.minimum_sale_rate ?? "—"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mapping Info & Actions */}
                        <div className="flex flex-wrap items-center gap-3 md:justify-end">
                          {/* Control Pills */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-350">
                              Priority: {m.priority ?? 100}
                            </span>
                            {m.is_orderable ? (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400">
                                Orderable
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                Non-Orderable
                              </span>
                            )}
                            {m.is_active !== false ? (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                Active
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400">
                                Inactive
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-3">
                            <button
                              type="button"
                              onClick={() => setEditMappingTarget(m)}
                              title="Edit Mapping Details"
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteMappingTarget(m)}
                              title="Delete Mapping"
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded text-slate-550 hover:text-red-655 dark:text-slate-400 dark:hover:text-red-400 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedMappingId(isExpanded ? null : m._id)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition flex items-center gap-1 text-xs font-semibold"
                            >
                              {isExpanded ? (
                                <>
                                  Hide Rates <ChevronUp className="h-4 w-4" />
                                </>
                              ) : (
                                <>
                                  Show Rates ({m.rates?.length ?? 0}) <ChevronDown className="h-4 w-4" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Remarks if exist */}
                      {m.remarks && (
                        <div className="px-5 py-2 text-xs text-slate-505 dark:text-slate-400 bg-slate-50/20 dark:bg-slate-900/20 border-b border-slate-100 dark:border-white/5 italic">
                          Remarks: {m.remarks}
                        </div>
                      )}

                      {/* Rates Section */}
                      {isExpanded && (
                        <div className="p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
                              Negotiated Rates Setup
                            </h5>
                            <button
                              type="button"
                              onClick={() => setAddRateTarget(m)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition"
                            >
                              <Plus className="h-3 w-3" /> Add Rate Tier
                            </button>
                          </div>

                          {!m.rates || m.rates.length === 0 ? (
                            <div className="py-6 text-center bg-slate-50/30 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-white/5 rounded-lg">
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                No custom rates configured. Orders will fall back to catalog base price.
                              </p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 font-semibold">
                                    <th className="py-2 pr-4">Rate Type</th>
                                    <th className="py-2 px-4 text-right">Negotiated Rate</th>
                                    <th className="py-2 px-4 text-center">Qty Bracket</th>
                                    <th className="py-2 px-4 text-center">Validity Range</th>
                                    <th className="py-2 px-4 text-center">Status</th>
                                    <th className="py-2 pl-4 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-300">
                                  {m.rates.map((r: any) => {
                                    // Status Badge styling
                                    let statusColor = "bg-slate-100 text-slate-650 dark:bg-white/5 dark:text-slate-400";
                                    if (r.status === "active") {
                                      statusColor = "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400";
                                    } else if (r.status === "draft") {
                                      statusColor = "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
                                    } else if (r.status === "expired" || r.status === "cancelled") {
                                      statusColor = "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400";
                                    }

                                    // Rate type label
                                    let typeLabel = r.rate_type;
                                    if (r.rate_type === "SR") typeLabel = "SR (Standard)";
                                    else if (r.rate_type === "SSR") typeLabel = "SSR (Special)";
                                    else if (r.rate_type === "CR") typeLabel = "CR (Contract)";

                                    // Check if validity_end has passed
                                    const isExpired = new Date(r.validity_end).getTime() < Date.now();
                                    const displayStatus = isExpired && r.status === "active" ? "expired" : r.status;
                                    const displayStatusColor = isExpired && r.status === "active"
                                      ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                                      : statusColor;

                                    return (
                                      <tr key={r._id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                        <td className="py-2.5 pr-4 font-medium flex items-center gap-1.5">
                                          {typeLabel}
                                          {r.approval_required && (
                                            <span className="text-[9px] bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-1 py-0.2 rounded font-bold uppercase">
                                              Req Approval
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-bold text-slate-905 dark:text-slate-50">
                                          ₹{Number(r.rate).toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-4 text-center font-mono">
                                          {r.min_qty ?? 1} - {r.max_qty === 999999 ? "∞" : r.max_qty}
                                        </td>
                                        <td className="py-2.5 px-4 text-center text-slate-500 dark:text-slate-400">
                                          {new Date(r.validity_start).toLocaleDateString()} to {new Date(r.validity_end).toLocaleDateString()}
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${displayStatusColor}`}>
                                            {displayStatus}
                                          </span>
                                        </td>
                                        <td className="py-2.5 pl-4 text-right">
                                          <div className="flex items-center justify-end gap-1.5">
                                            {r.status === "draft" && (
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  try {
                                                    await approveRate(r._id).unwrap();
                                                    toast.success("Rate tier approved successfully!");
                                                  } catch (err) {
                                                    toast.error(mutationRejectedMessage(err));
                                                  }
                                                }}
                                                title="Approve Rate"
                                                className="p-1 hover:bg-green-50 dark:hover:bg-green-500/10 text-green-600 rounded transition animate-pulse"
                                              >
                                                <Check className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => setEditRateTarget({ mapping: m, rate: r })}
                                              title="Edit Rate Values"
                                              className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-550 dark:text-slate-400 rounded transition"
                                            >
                                              <Edit className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setDeleteRateTarget({
                                                mappingId: m._id,
                                                rateId: r._id,
                                                rateLabel: `₹${r.rate} (${r.rate_type})`
                                              })}
                                              title="Delete Rate"
                                              className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-550 hover:text-red-500 transition"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map New Product Modal */}
      {isMapModalOpen && (
        <MapNewProductModal
          isOpen={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          partyId={id}
          mappedProductIds={mappedProductIds}
          createMapping={createMapping}
          isCreating={isCreating}
        />
      )}

      {/* Edit Mapping Modal */}
      {editMappingTarget && (
        <EditMappingModal
          mapping={editMappingTarget}
          onClose={() => setEditMappingTarget(null)}
          patchMapping={patchMapping}
          isPatching={isPatching}
        />
      )}

      {/* Add Rate Modal */}
      {addRateTarget && (
        <AddRateModal
          mapping={addRateTarget}
          onClose={() => setAddRateTarget(null)}
          addRate={addRate}
          isAddingRate={isAddingRate}
        />
      )}

      {/* Edit Rate Modal */}
      {editRateTarget && (
        <EditRateModal
          mapping={editRateTarget.mapping}
          rate={editRateTarget.rate}
          onClose={() => setEditRateTarget(null)}
          updateRate={updateRate}
          isUpdatingRate={isUpdatingRate}
        />
      )}

      {/* Delete Mapping Confirmation */}
      {deleteMappingTarget && (
        <ConfirmDeleteMappingModal
          mapping={deleteMappingTarget}
          onClose={() => setDeleteMappingTarget(null)}
          deleteMapping={deleteMapping}
          isDeleting={isDeleting}
        />
      )}

      {/* Delete Rate Confirmation */}
      {deleteRateTarget && (
        <ConfirmDeleteRateModal
          target={deleteRateTarget}
          onClose={() => setDeleteRateTarget(null)}
          deleteRate={deleteRate}
          isDeleting={isDeletingRate}
        />
      )}
    </div>
  );
}

// ==========================================
// Sub-components: Products & Rates Modals
// ==========================================

type MapNewProductModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
  mappedProductIds: string[];
  createMapping: any;
  isCreating: boolean;
};

function MapNewProductModal({
  onClose,
  partyId,
  mappedProductIds,
  createMapping,
  isCreating,
}: MapNewProductModalProps) {
  const { data: rawProducts, isLoading: isProductsLoading } = useListProductsQuery();
  const products = useMemo(() => {
    const list = Array.isArray(rawProducts) ? rawProducts : [];
    return list.filter((p: any) => p.is_active !== false && !mappedProductIds.includes(p._id));
  }, [rawProducts, mappedProductIds]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [priority, setPriority] = useState("100");
  const [isOrderable, setIsOrderable] = useState(true);
  const [remarks, setRemarks] = useState("");

  // Rate Info
  const [hasRate, setHasRate] = useState(false);
  const [rateType, setRateType] = useState("SR");
  const [rate, setRate] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [maxQty, setMaxQty] = useState("999999");
  const [validityStart, setValidityStart] = useState(() => new Date().toISOString().split("T")[0]);
  const [validityEnd, setValidityEnd] = useState(() => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear.toISOString().split("T")[0];
  });
  const [rateRemarks, setRateRemarks] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error("Please select a product");
      return;
    }
    const payload: any = {
      party: partyId,
      product: selectedProductId,
      priority: Number(priority) || 100,
      is_orderable: isOrderable,
      remarks: remarks.trim(),
    };

    if (hasRate) {
      if (!rate || Number(rate) < 0) {
        toast.error("Please enter a valid rate");
        return;
      }
      if (new Date(validityStart) >= new Date(validityEnd)) {
        toast.error("Validity Start date must be before Validity End date");
        return;
      }
      payload.rates = [
        {
          rate_type: rateType,
          rate: Number(rate),
          min_qty: Number(minQty) || 1,
          max_qty: Number(maxQty) || 999999,
          validity_start: validityStart,
          validity_end: validityEnd,
          remarks: rateRemarks.trim(),
        },
      ];
    }

    try {
      await createMapping(payload).unwrap();
      toast.success("Product mapped successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-500" /> Map New Product
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Select Catalog Product</label>
            {isProductsLoading ? (
              <div className="text-xs text-slate-550 py-2">Loading product catalog...</div>
            ) : products.length === 0 ? (
              <div className="text-xs text-red-500 py-2 font-medium">All active catalog products are already mapped to this party.</div>
            ) : (
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              >
                <option value="">-- Choose a Product --</option>
                {products.map((p: any) => (
                  <option key={p._id} value={p._id}>
                    {p.product_name} ({p.sku || "No SKU"}) — Base: ₹{p.base_price}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mapping Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                required
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 outline-none transition focus:border-blue-600"
              />
            </div>
            <div className="flex items-center h-full pt-6">
              <label className="flex items-center gap-2 text-sm text-slate-850 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOrderable}
                  onChange={(e) => setIsOrderable(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                Is Orderable
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mapping Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="e.g. Approved under corporate tier terms"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 outline-none transition focus:border-blue-600"
            />
          </div>

          {/* Negotiated Rate section */}
          <div className="border-t border-slate-100 dark:border-white/5 pt-4 shrink-0">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-105 cursor-pointer">
              <input
                type="checkbox"
                checked={hasRate}
                onChange={(e) => setHasRate(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Setup Initial Negotiated Rate
            </label>

            {hasRate && (
              <div className="mt-4 p-4 rounded-xl bg-slate-50/50 dark:bg-white/5 border border-slate-150 dark:border-white/5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Type</label>
                    <select
                      value={rateType}
                      onChange={(e) => setRateType(e.target.value)}
                      className="w-full rounded-lg border border-slate-250 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    >
                      <option value="SR">Standard Rate (SR)</option>
                      <option value="SSR">Special Standard Rate (SSR)</option>
                      <option value="CR">Contract Rate (CR)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Negotiated Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      required={hasRate}
                      placeholder="e.g. 450.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Min Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={minQty}
                      onChange={(e) => setMinQty(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Max Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={maxQty}
                      onChange={(e) => setMaxQty(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity Start</label>
                    <input
                      type="date"
                      value={validityStart}
                      onChange={(e) => setValidityStart(e.target.value)}
                      required={hasRate}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity End</label>
                    <input
                      type="date"
                      value={validityEnd}
                      onChange={(e) => setValidityEnd(e.target.value)}
                      required={hasRate}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Remarks</label>
                  <input
                    type="text"
                    value={rateRemarks}
                    onChange={(e) => setRateRemarks(e.target.value)}
                    placeholder="e.g. Promotional offer for Q2"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isCreating || products.length === 0}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isCreating ? "Mapping..." : "Map Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

type EditMappingModalProps = {
  mapping: any;
  onClose: () => void;
  patchMapping: any;
  isPatching: boolean;
};

function EditMappingModal({
  mapping,
  onClose,
  patchMapping,
  isPatching,
}: EditMappingModalProps) {
  const [priority, setPriority] = useState(String(mapping.priority ?? 100));
  const [isActive, setIsActive] = useState(mapping.is_active !== false);
  const [isOrderable, setIsOrderable] = useState(mapping.is_orderable !== false);
  const [remarks, setRemarks] = useState(mapping.remarks || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await patchMapping({
        id: mapping._id,
        patch: {
          priority: Number(priority) || 0,
          is_active: isActive,
          is_orderable: isOrderable,
          remarks: remarks.trim(),
        },
      }).unwrap();
      toast.success("Mapping updated successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-500" /> Edit Mapping
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3.5 border border-slate-100 dark:border-white/5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Target Product</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-50 mt-0.5">{mapping.product?.product_name}</div>
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">SKU: {mapping.product?.sku || "—"}</div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mapping Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              required
              min="0"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-350 cursor-pointer">
              <input
                type="checkbox"
                checked={isOrderable}
                onChange={(e) => setIsOrderable(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Is Orderable
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-805 dark:text-slate-355 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Is Active
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="Enter remarks..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
            />
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPatching}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isPatching ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

type AddRateModalProps = {
  mapping: any;
  onClose: () => void;
  addRate: any;
  isAddingRate: boolean;
};

function AddRateModal({
  mapping,
  onClose,
  addRate,
  isAddingRate,
}: AddRateModalProps) {
  const [rateType, setRateType] = useState("SR");
  const [rate, setRate] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [maxQty, setMaxQty] = useState("999999");
  const [validityStart, setValidityStart] = useState(() => new Date().toISOString().split("T")[0]);
  const [validityEnd, setValidityEnd] = useState(() => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear.toISOString().split("T")[0];
  });
  const [remarks, setRemarks] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate || Number(rate) < 0) {
      toast.error("Please enter a valid rate");
      return;
    }
    if (new Date(validityStart) >= new Date(validityEnd)) {
      toast.error("Validity Start date must be before Validity End date");
      return;
    }

    try {
      const pId = typeof mapping.party === "object" ? mapping.party?._id || mapping.party?.id : mapping.party;
      const prId = typeof mapping.product === "object" ? mapping.product?._id || mapping.product?.id : mapping.product;
      await addRate({
        id: mapping._id,
        body: {
          party: pId,
          product: prId,
          rate_type: rateType,
          rate: Number(rate),
          min_qty: Number(minQty) || 1,
          max_qty: Number(maxQty) || 999999,
          validity_start: validityStart,
          validity_end: validityEnd,
          remarks: remarks.trim(),
        },
      }).unwrap();
      toast.success("Negotiated rate tier added successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-500" /> Add Custom Rate Tier
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Adding pricing tier for:</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-50">{mapping.product?.product_name}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Type</label>
              <select
                value={rateType}
                onChange={(e) => setRateType(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              >
                <option value="SR">Standard Rate (SR)</option>
                <option value="SSR">Special Standard Rate (SSR)</option>
                <option value="CR">Contract Rate (CR)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
                placeholder="e.g. 480.00"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Min Quantity</label>
              <input
                type="number"
                min="1"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Max Quantity</label>
              <input
                type="number"
                min="1"
                value={maxQty}
                onChange={(e) => setMaxQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity Start</label>
              <input
                type="date"
                value={validityStart}
                onChange={(e) => setValidityStart(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity End</label>
              <input
                type="date"
                value={validityEnd}
                onChange={(e) => setValidityEnd(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Special tier for Q2 contract"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
            />
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isAddingRate}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isAddingRate ? "Adding..." : "Add Price Tier"}
          </button>
        </div>
      </div>
    </div>
  );
}

type EditRateModalProps = {
  mapping: any;
  rate: any;
  onClose: () => void;
  updateRate: any;
  isUpdatingRate: boolean;
};

function EditRateModal({
  mapping,
  rate,
  onClose,
  updateRate,
  isUpdatingRate,
}: EditRateModalProps) {
  const [rateVal, setRateVal] = useState(String(rate.rate ?? ""));
  const [minQty, setMinQty] = useState(String(rate.min_qty ?? 1));
  const [maxQty, setMaxQty] = useState(String(rate.max_qty ?? 999999));
  const [validityStart, setValidityStart] = useState(() => {
    if (!rate.validity_start) return "";
    return new Date(rate.validity_start).toISOString().split("T")[0];
  });
  const [validityEnd, setValidityEnd] = useState(() => {
    if (!rate.validity_end) return "";
    return new Date(rate.validity_end).toISOString().split("T")[0];
  });
  const [status, setStatus] = useState(rate.status || "active");
  const [remarks, setRemarks] = useState(rate.remarks || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateVal || Number(rateVal) < 0) {
      toast.error("Please enter a valid rate");
      return;
    }
    if (new Date(validityStart) >= new Date(validityEnd)) {
      toast.error("Validity Start date must be before Validity End date");
      return;
    }

    try {
      await updateRate({
        rateId: rate._id,
        patch: {
          rate: Number(rateVal),
          min_qty: Number(minQty) || 1,
          max_qty: Number(maxQty) || 999999,
          validity_start: validityStart,
          validity_end: validityEnd,
          status,
          remarks: remarks.trim(),
        },
      }).unwrap();
      toast.success("Rate tier updated successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-500" /> Edit Rate Tier
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-550 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Editing rate tier for:</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-50">{mapping.product?.product_name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">Type: {rate.rate_type}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rateVal}
                onChange={(e) => setRateVal(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Min Quantity</label>
              <input
                type="number"
                min="1"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Max Quantity</label>
              <input
                type="number"
                min="1"
                value={maxQty}
                onChange={(e) => setMaxQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity Start</label>
              <input
                type="date"
                value={validityStart}
                onChange={(e) => setValidityStart(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity End</label>
              <input
                type="date"
                value={validityEnd}
                onChange={(e) => setValidityEnd(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
            />
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isUpdatingRate}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isUpdatingRate ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmDeleteMappingModalProps = {
  mapping: any;
  onClose: () => void;
  deleteMapping: any;
  isDeleting: boolean;
};

function ConfirmDeleteMappingModal({
  mapping,
  onClose,
  deleteMapping,
  isDeleting,
}: ConfirmDeleteMappingModalProps) {
  const handleConfirm = async () => {
    try {
      await deleteMapping(mapping._id).unwrap();
      toast.success("Mapping deleted successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 flex items-start gap-3">
          <div className="p-2 bg-red-50 dark:bg-red-500/10 text-red-600 rounded-full shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-md font-bold text-slate-905 dark:text-slate-50">Delete Product Mapping?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Are you sure you want to remove the custom product mapping for{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {mapping.product?.product_name || "this product"}
              </span>
              ?
            </p>
            <p className="text-xs text-red-505 dark:text-red-400 mt-1 font-semibold">
              Warning: This will also soft-delete all negotiated rates configured under this product mapping.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200/95 px-3 py-1.5 text-xs font-semibold text-slate-850 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition dark:bg-red-500 dark:hover:bg-red-400"
          >
            {isDeleting ? "Deleting..." : "Delete Mapping"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmDeleteRateModalProps = {
  target: { mappingId: string; rateId: string; rateLabel: string };
  onClose: () => void;
  deleteRate: any;
  isDeleting: boolean;
};

function ConfirmDeleteRateModal({
  target,
  onClose,
  deleteRate,
  isDeleting,
}: ConfirmDeleteRateModalProps) {
  const handleConfirm = async () => {
    try {
      await deleteRate(target.rateId).unwrap();
      toast.success("Rate tier deleted successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 flex items-start gap-3">
          <div className="p-2 bg-red-50 dark:bg-red-500/10 text-red-600 rounded-full shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-md font-bold text-slate-905 dark:text-slate-50">Delete Rate Tier?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Are you sure you want to delete the rate tier for{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {target.rateLabel}
              </span>
              ?
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-850 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition dark:bg-red-500 dark:hover:bg-red-400"
          >
            {isDeleting ? "Deleting..." : "Delete Rate"}
          </button>
        </div>
      </div>
    </div>
  );
}
