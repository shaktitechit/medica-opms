import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Calculator,
  FileText,
  Building2,
  UserCheck,
  ShieldCheck,
  RefreshCw,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  Search,
  Check,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Minus,
} from "lucide-react";
import {
  useCreateLeadQuotationMutation,
  useUpdateLeadQuotationMutation,
  useListTermsAndConditionsQuery,
  useListProductsQuery,
  useListPartiesQuery,
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

export type CatalogProduct = {
  _id: string;
  product_name: string;
  sku?: string;
  hsn_code?: string;
  base_price?: number;
  minimum_sale_rate?: number;
  mrp?: number;
  gst_percent?: number;
  default_gst_rate?: number;
  brand?: string;
  manufacturer?: string;
  product_group?: string;
  description?: string;
  unit?: string;
};

/** Resolve API product refs that may be a plain string or hydrated `{ name }` object. */
function refDisplayLabel(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const s = value.trim();
    // Bare ObjectIds are not useful for search/display
    if (/^[0-9a-fA-F]{24}$/.test(s)) return "";
    return s;
  }
  if (typeof value === "object") {
    const o = value as { name?: unknown; label?: unknown; title?: unknown };
    for (const key of ["name", "label", "title"] as const) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

function pickCatalogProducts(raw: unknown): CatalogProduct[] {
  let rows: unknown[] = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) rows = o.items;
    else if (Array.isArray(o.data)) rows = o.data;
    else if (Array.isArray(o.products)) rows = o.products;
  }

  return rows
    .map((row): CatalogProduct | null => {
      if (!row || typeof row !== "object") return null;
      const p = row as Record<string, unknown>;
      const id = p._id ?? p.id;
      if (id == null || id === "") return null;
      const name = typeof p.product_name === "string" ? p.product_name.trim() : "";
      if (!name) return null;
      return {
        _id: String(id),
        product_name: name,
        sku: typeof p.sku === "string" ? p.sku : undefined,
        hsn_code: typeof p.hsn_code === "string" ? p.hsn_code : undefined,
        base_price: p.base_price != null ? Number(p.base_price) : undefined,
        minimum_sale_rate:
          p.minimum_sale_rate != null ? Number(p.minimum_sale_rate) : undefined,
        mrp: p.mrp != null ? Number(p.mrp) : undefined,
        gst_percent: p.gst_percent != null ? Number(p.gst_percent) : undefined,
        default_gst_rate:
          p.default_gst_rate != null ? Number(p.default_gst_rate) : undefined,
        brand: refDisplayLabel(p.brand) || undefined,
        manufacturer: refDisplayLabel(p.manufacturer) || undefined,
        product_group: refDisplayLabel(p.product_group) || undefined,
        description: typeof p.description === "string" ? p.description : undefined,
        unit: typeof p.unit === "string" ? p.unit : undefined,
      };
    })
    .filter((p): p is CatalogProduct => p != null);
}

export type PartyItem = {
  _id?: string;
  id?: string;
  party_name?: string;
  party_code?: string;
  party_type?: "customer" | "supplier" | "both" | string;
  contact_person?: string;
  mobile?: string;
  phone?: string;
  email?: string;
  contacts?: Array<{
    name?: string;
    department?: string;
    phone?: string;
    email?: string;
    alternate_phone?: string;
  }>;
  gst_no?: string;
  billing_address?: {
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  district?: string;
  state?: string;
  sra?: boolean;
};

function pickParties(raw: unknown): PartyItem[] {
  if (Array.isArray(raw)) return raw as PartyItem[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as PartyItem[];
    if (Array.isArray(o.data)) return o.data as PartyItem[];
    if (Array.isArray(o.parties)) return o.parties as PartyItem[];
  }
  return [];
}

/**
 * Searchable Autocomplete for Party Master directory
 */
function PartySearchAutocomplete({
  parties,
  selectedPartyId,
  onSelect,
}: {
  parties: PartyItem[];
  selectedPartyId: string;
  onSelect: (party: PartyItem | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedParty = useMemo(() => {
    if (!selectedPartyId) return null;
    return parties.find((p) => String(p._id ?? p.id ?? "") === String(selectedPartyId)) || null;
  }, [parties, selectedPartyId]);

  const filteredParties = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return parties.slice(0, 50);
    return parties.filter((p) => {
      const name = String(p.party_name || "").toLowerCase();
      const code = String(p.party_code || "").toLowerCase();
      const person = String(p.contact_person || "").toLowerCase();
      const mobile = String(p.mobile || p.phone || "").toLowerCase();
      const email = String(p.email || "").toLowerCase();
      const city = String(p.billing_address?.city || p.district || "").toLowerCase();
      const gst = String(p.gst_no || "").toLowerCase();
      return (
        name.includes(q) ||
        code.includes(q) ||
        person.includes(q) ||
        mobile.includes(q) ||
        email.includes(q) ||
        city.includes(q) ||
        gst.includes(q)
      );
    }).slice(0, 50);
  }, [parties, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
              if (filteredParties.length > 0) {
                onSelect(filteredParties[0]);
                setIsOpen(false);
                setSearch("");
              }
            } else if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={
            selectedParty
              ? `Linked: ${selectedParty.party_name} (Search to change party...)`
              : "Search Party Master by party name, contact person, mobile, city, GSTIN..."
          }
          className="w-full rounded-xl border border-blue-200 bg-white py-2 pl-9 pr-8 text-xs font-semibold text-slate-800 placeholder-slate-400 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
        />
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-blue-500">
          <Search className="h-3.5 w-3.5" />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setIsOpen(false);
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <span>Party Master Directory ({filteredParties.length} found)</span>
            <span className="text-[9px] text-slate-400 lowercase">click to select & autofill</span>
          </div>
          {filteredParties.length === 0 ? (
            <div className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching parties found for &quot;{search}&quot;
            </div>
          ) : (
            filteredParties.map((p) => {
              const id = String(p._id ?? p.id ?? "");
              const isSelected = id === selectedPartyId;
              const location = [p.billing_address?.city || p.district, p.billing_address?.state || p.state]
                .filter(Boolean)
                .join(", ");
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full flex-col px-3 py-2 text-left text-xs transition border-b border-slate-50 dark:border-white/5 last:border-0 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 cursor-pointer ${
                    isSelected
                      ? "bg-blue-50 font-medium text-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {p.party_name}
                      </span>
                      {p.party_code && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {p.party_code}
                        </span>
                      )}
                      {p.party_type && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 capitalize dark:bg-slate-800 dark:text-slate-300">
                          {p.party_type}
                        </span>
                      )}
                      {p.sra === true && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          SRA
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {(p.contact_person || (p.contacts && p.contacts[0]?.name)) && (
                      <span>👤 {p.contact_person || p.contacts?.[0]?.name}</span>
                    )}
                    {(p.mobile || p.phone || (p.contacts && p.contacts[0]?.phone)) && (
                      <span>📞 {p.mobile || p.phone || p.contacts?.[0]?.phone}</span>
                    )}
                    {location && <span>📍 {location}</span>}
                    {p.gst_no && <span className="font-mono text-[10px]">GST: {p.gst_no}</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Quick Search & Add product directly from Catalog toolbar
 */
function QuickProductSearchAndAdd({
  products,
  onAddProduct,
  isLoading = false,
}: {
  products: CatalogProduct[];
  onAddProduct: (product: CatalogProduct) => void;
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return products
      .filter((p) => {
        const name = String(p.product_name || "").toLowerCase();
        const sku = String(p.sku || "").toLowerCase();
        const brand = String(p.brand || "").toLowerCase();
        const mfr = String(p.manufacturer || "").toLowerCase();
        const group = String(p.product_group || "").toLowerCase();
        const hsn = String(p.hsn_code || "").toLowerCase();
        return (
          name.includes(q) ||
          sku.includes(q) ||
          brand.includes(q) ||
          mfr.includes(q) ||
          group.includes(q) ||
          hsn.includes(q)
        );
      })
      .slice(0, 30);
  }, [products, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (p: CatalogProduct) => {
    onAddProduct(p);
    setSearch("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative z-30 w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (search.trim()) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (filteredProducts.length > 0) {
                handleSelect(filteredProducts[0]);
              }
            } else if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={
            isLoading
              ? "Loading catalog products..."
              : products.length === 0
                ? "No catalog products available"
                : "Quick search product from catalog to add (name, SKU, brand)..."
          }
          disabled={isLoading || products.length === 0}
          className="w-full rounded-xl border border-blue-200 bg-white py-2 pl-9 pr-8 text-xs font-semibold text-slate-800 placeholder-slate-400 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-white"
        />
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-blue-500">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setIsOpen(false);
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && search.trim().length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <span>Matching Catalog Products ({filteredProducts.length})</span>
            <span className="text-[9px] text-blue-600 font-semibold dark:text-blue-400">
              Click or press Enter to add
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
              No products found matching &quot;{search}&quot;
              {products.length > 0 ? (
                <span className="block mt-1 text-[10px] text-slate-400">
                  Searched {products.length} catalog items
                </span>
              ) : null}
            </div>
          ) : (
            filteredProducts.map((p) => {
              const price = p.base_price ?? p.minimum_sale_rate ?? p.mrp ?? 0;
              return (
                <button
                  key={p._id}
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent input blur/outside handlers from swallowing the selection
                    e.preventDefault();
                    handleSelect(p);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition border-b border-slate-50 dark:border-white/5 last:border-0 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 cursor-pointer"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {p.product_name}
                      </span>
                      {p.sku ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {p.sku}
                        </span>
                      ) : null}
                      {p.brand ? (
                        <span className="rounded-full bg-blue-50 px-1.5 py-0.2 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {p.brand}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      {p.hsn_code ? <span>HSN: {p.hsn_code}</span> : null}
                      {p.unit ? <span>Unit: {p.unit}</span> : null}
                      {p.product_group ? <span>Group: {p.product_group}</span> : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-bold text-blue-600 dark:text-blue-400">
                      ₹{Number(price || 0).toLocaleString("en-IN")}
                    </div>
                    <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <Plus className="h-3 w-3" /> Add to Quote
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Searchable Product Selector used inside each line item row
 */
function ProductRowAutocomplete({
  products,
  selectedId,
  onSelect,
}: {
  products: CatalogProduct[];
  selectedId?: string;
  onSelect: (productId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    if (!selectedId) return null;
    return products.find((p) => p._id === selectedId) || null;
  }, [products, selectedId]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products.slice(0, 30);
    return products
      .filter((p) => {
        const name = String(p.product_name || "").toLowerCase();
        const sku = String(p.sku || "").toLowerCase();
        const brand = String(p.brand || "").toLowerCase();
        return name.includes(q) || sku.includes(q) || brand.includes(q);
      })
      .slice(0, 30);
  }, [products, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full mb-1">
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
              if (filteredProducts.length > 0) {
                onSelect(filteredProducts[0]._id);
                setSearch("");
                setIsOpen(false);
              }
            } else if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={
            selectedProduct
              ? `Catalog: ${selectedProduct.product_name} (${selectedProduct.sku || "Linked"})`
              : "Search & link catalog product..."
          }
          className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-6 text-[11px] text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
        />
        <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-slate-400">
          <Search className="h-3 w-3" />
        </div>
        {selectedProduct && (
          <button
            type="button"
            onClick={() => {
              onSelect("");
              setSearch("");
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-rose-500 cursor-pointer"
            title="Unlink catalog product"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <span>Select Catalog Item ({filteredProducts.length})</span>
            <span className="text-[9px] text-slate-400">scroll or type to search</span>
          </div>
          {filteredProducts.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">No catalog products found</div>
          ) : (
            filteredProducts.map((p) => {
              const isSelected = p._id === selectedId;
              const price = p.base_price ?? p.minimum_sale_rate ?? p.mrp ?? 0;
              return (
                <button
                  key={p._id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(p._id);
                    setSearch("");
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] transition hover:bg-blue-50/70 dark:hover:bg-blue-950/40 cursor-pointer ${
                    isSelected ? "bg-blue-50 text-blue-700 font-bold dark:bg-blue-950 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <span className="truncate pr-2">
                    {p.product_name}
                    {p.sku && <span className="text-[10px] text-slate-400 ml-1 font-mono">({p.sku})</span>}
                  </span>
                  <span className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">
                    ₹{price.toLocaleString("en-IN")}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

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

  const { data: productsData, isFetching: isFetchingProducts } = useListProductsQuery(
    { limit: "2000" },
    { skip: !open }
  );
  const products = useMemo(() => pickCatalogProducts(productsData), [productsData]);

  const { data: partiesData } = useListPartiesQuery({ limit: "500" }, { skip: !open });
  const parties = useMemo(() => pickParties(partiesData), [partiesData]);
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");

  const selectedParty = useMemo(() => {
    if (!selectedPartyId) return null;
    return parties.find((p) => String(p._id ?? p.id ?? "") === String(selectedPartyId)) || null;
  }, [parties, selectedPartyId]);

  useGetCompanyInfoQuery();

  const { data: usersData } = useListUsersQuery();
  const usersList = useMemo(() => {
    return (
      Array.isArray(usersData)
        ? usersData
        : (usersData as { items?: unknown[] })?.items || (usersData as { data?: unknown[] })?.data || []
    ) as Array<{ _id: string; name: string; email: string; phone?: string; department?: string; is_active?: boolean }>;
  }, [usersData]);

  const adminUsers = useMemo(() => {
    return usersList.filter(
      (u) =>
        u.department === "admin" ||
        u.department === "super_admin" ||
        u.department === "finance"
    );
  }, [usersList]);

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

  const [termsSearch, setTermsSearch] = useState("");
  const [termsTypeFilter, setTermsTypeFilter] = useState<string>("all");
  const [expandedSetIds, setExpandedSetIds] = useState<string[]>([]);

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
      setSelectedPartyId("");
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

    const leadPartyId = targetLead.party_id?._id || (typeof targetLead.party_id === "string" ? targetLead.party_id : "") || "";
    setSelectedPartyId(leadPartyId);

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

  const handlePartySelect = (p: PartyItem | null) => {
    if (!p) {
      setSelectedPartyId("");
      return;
    }
    const pId = String(p._id ?? p.id ?? "");
    setSelectedPartyId(pId);
    setCustomerName(p.party_name || "");
    const primaryContact = p.contacts && p.contacts.length > 0 ? p.contacts[0] : null;
    setKindAttn(p.contact_person || primaryContact?.name || "");
    setPhone(p.mobile || p.phone || primaryContact?.phone || "");
    setCell(p.mobile || primaryContact?.phone || primaryContact?.alternate_phone || "");
    setEmail(p.email || primaryContact?.email || "");
    setGstin(p.gst_no || "");

    const addr = [p.billing_address?.address_line_1, p.billing_address?.address_line_2]
      .filter(Boolean)
      .join(", ");
    setAddressLine(addr || "");
    setCity(p.billing_address?.city || p.district || "");
    setState(p.billing_address?.state || p.state || "");
    setPincode(p.billing_address?.pincode || "");

    toast.success(`Loaded customer details for "${p.party_name}"`);
  };

  const handlePartyContactSwitch = (contactName: string) => {
    if (!selectedParty?.contacts) return;
    const c = selectedParty.contacts.find((ct) => ct.name === contactName);
    if (c) {
      setKindAttn(c.name || "");
      if (c.phone) setPhone(c.phone);
      if (c.phone || c.alternate_phone) setCell(c.phone || c.alternate_phone || "");
      if (c.email) setEmail(c.email);
      toast.info(`Switched contact to ${c.name}${c.department ? ` (${c.department})` : ""}`);
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
  const [signatoryUserId, setSignatoryUserId] = useState("");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryPhone, setSignatoryPhone] = useState("");
  const [signatoryEmail, setSignatoryEmail] = useState("");
  const [signatoryDesignation, setSignatoryDesignation] = useState("");

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
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open) return;

    if (quotation) {
      setSelectedPartyId(quotation.party_id || "");
      setSelectedLeadId(typeof quotation.lead === "object" ? quotation.lead?._id : quotation.lead || "");
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
      const qSignatoryId =
        typeof quotation.signatory_user === "object"
          ? quotation.signatory_user?._id || ""
          : quotation.signatory_user || "";
      setSignatoryUserId(qSignatoryId);
      setSignatoryName(quotation.signatory_name || "");
      setSignatoryPhone(quotation.signatory_phone || "");
      setSignatoryEmail(quotation.signatory_email || "");
      setSignatoryDesignation(quotation.signatory_designation || "");

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
          : []
      );
    } else if (lead) {
      // New quotation from Lead
      setSelectedLeadId(lead._id);
      const leadPartyId = lead.party_id?._id || (typeof lead.party_id === "string" ? lead.party_id : "") || "";
      setSelectedPartyId(leadPartyId);
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

      // Signatory initially blank, only filled after selecting
      setSignatoryUserId("");
      setSignatoryName("");
      setSignatoryPhone("");
      setSignatoryEmail("");
      setSignatoryDesignation("");

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
      setTerms([]);
    } else {
      setSelectedLeadId("");
      setSelectedPartyId("");
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
      // Signatory initially blank, only filled after selecting
      setSignatoryUserId("");
      setSignatoryName("");
      setSignatoryPhone("");
      setSignatoryEmail("");
      setSignatoryDesignation("");
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
      setTerms([]);
    }
  }, [open, quotation, lead, autoNextRefNo]);

  const handleSelectAdminUser = (userId: string) => {
    if (!userId) {
      setSignatoryUserId("");
      setSignatoryName("");
      setSignatoryPhone("");
      setSignatoryEmail("");
      setSignatoryDesignation("");
      return;
    }
    const selected = usersList.find((u) => u._id === userId);
    if (!selected) return;
    setSignatoryUserId(selected._id);
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
    const computedItems = items.map((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const taxable = Math.round(qty * rate * 100) / 100;
      const gstRate = Number(item.gst_rate) || 0;
      const gstAmt = Math.round(((taxable * gstRate) / 100) * 100) / 100;
      const lineTotal = Math.round((taxable + gstAmt) * 100) / 100;

      return {
        ...item,
        taxable,
        gstAmt,
        lineTotal,
      };
    });

    const subtotal = Math.round(computedItems.reduce((acc, it) => acc + it.taxable, 0) * 100) / 100;
    const totalGst = Math.round(computedItems.reduce((acc, it) => acc + it.gstAmt, 0) * 100) / 100;
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
    if (!productId) {
      setItems((prev) =>
        prev.map((it, idx) => (idx === index ? { ...it, product: undefined } : it))
      );
      return;
    }
    const found = products.find((p) => p._id === productId);
    if (!found) return;

    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        return {
          ...it,
          product: found._id,
          product_name: found.product_name,
          hsn_code: found.hsn_code || it.hsn_code || "9018",
          rate: Number(found.base_price ?? found.minimum_sale_rate ?? it.rate ?? 0),
          unit: found.unit || it.unit || "Nos",
          gst_rate: Number(found.gst_percent ?? it.gst_rate ?? 5),
        };
      })
    );
  };

  const handleQuickAddProduct = (p: CatalogProduct) => {
    const rate = Number(p.base_price ?? p.minimum_sale_rate ?? p.mrp ?? 0);
    const gstRate = Number(p.gst_percent ?? p.default_gst_rate ?? 5);
    const newItem: ItemState = {
      product: p._id,
      product_name: p.product_name,
      description: p.description || "",
      hsn_code: p.hsn_code || "9018",
      quantity: 1,
      unit: p.unit || "Nos",
      rate,
      gst_rate: gstRate,
    };

    setItems((prev) => {
      if (
        prev.length === 1 &&
        !prev[0].product &&
        (!prev[0].product_name ||
          prev[0].product_name === "Medical Equipment / Supplies" ||
          prev[0].product_name === "Fresenius Hemodialysis Machine" ||
          prev[0].product_name === "Fresenius Hemodialysis Machine Fresenius 4008 A") &&
        prev[0].rate === 0
      ) {
        return [newItem];
      }
      return [...prev, newItem];
    });

    if (!subject || subject === "Offer For Medical Equipment") {
      setSubject(`Offer For ${p.product_name}`);
    }

    toast.success(`Added "${p.product_name}" to quotation items`);
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

  const handleMoveTerm = (index: number, direction: "up" | "down") => {
    setTerms((prev) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const filteredTermsSets = useMemo(() => {
    return masterTermsSets.filter((set) => {
      if (termsTypeFilter !== "all" && set.type !== termsTypeFilter) {
        return false;
      }
      if (!termsSearch.trim()) return true;
      const q = termsSearch.toLowerCase().trim();
      const titleMatch = set.title?.toLowerCase().includes(q);
      const codeMatch = set.code?.toLowerCase().includes(q);
      const textMatch = (set.terms_text || []).some((t) =>
        t.text?.toLowerCase().includes(q)
      );
      return titleMatch || codeMatch || textMatch;
    });
  }, [masterTermsSets, termsTypeFilter, termsSearch]);

  const getSetLines = (set: TermsAndConditionsRecord): string[] => {
    return (set.terms_text || [])
      .filter((t) => t.is_active !== false && t.text && t.text.trim())
      .slice()
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      .map((t) => t.text.trim());
  };

  const getSetSelectionStatus = (set: TermsAndConditionsRecord): "none" | "all" | "partial" => {
    const lines = getSetLines(set);
    if (lines.length === 0) return "none";
    const presentCount = lines.filter((l) => terms.some((t) => t.trim() === l)).length;
    if (presentCount === lines.length) return "all";
    if (presentCount > 0) return "partial";
    return "none";
  };

  const handleToggleTermsSet = (set: TermsAndConditionsRecord) => {
    const setLines = getSetLines(set);
    if (setLines.length === 0) return;
    const status = getSetSelectionStatus(set);

    if (status === "all") {
      // Deselecting: remove all lines belonging to this set
      setTerms((prev) => prev.filter((t) => !setLines.includes(t.trim())));
    } else {
      // Selecting: add all missing lines from this set
      setTerms((prev) => {
        const existing = new Set(prev.map((t) => t.trim()));
        const toAdd = setLines.filter((l) => !existing.has(l));
        return [...prev, ...toAdd];
      });
    }
  };

  const handleToggleClause = (clauseText: string) => {
    const trimmed = clauseText.trim();
    if (!trimmed) return;
    setTerms((prev) => {
      const exists = prev.some((t) => t.trim() === trimmed);
      if (exists) {
        return prev.filter((t) => t.trim() !== trimmed);
      } else {
        return [...prev, trimmed];
      }
    });
  };

  const handleToggleExpandSet = (setId: string) => {
    setExpandedSetIds((prev) =>
      prev.includes(setId) ? prev.filter((id) => id !== setId) : [...prev, setId]
    );
  };

  const handleSelectAllFilteredSets = () => {
    const linesToAdd: string[] = [];
    filteredTermsSets.forEach((set) => {
      getSetLines(set).forEach((l) => {
        if (!linesToAdd.includes(l)) {
          linesToAdd.push(l);
        }
      });
    });
    setTerms((prev) => {
      const existing = new Set(prev.map((t) => t.trim()));
      const toAdd = linesToAdd.filter((l) => !existing.has(l));
      return [...prev, ...toAdd];
    });
  };

  const handleClearAllTerms = () => {
    setTerms([]);
  };

  const handleAddTerm = () => {
    setTerms((prev) => [...prev, "New Condition: Enter terms details here."]);
  };

  const handleRemoveTerm = (index: number) => {
    setTerms((prev) => prev.filter((_, idx) => idx !== index));
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

    if (!signatoryName.trim()) {
      toast.error("Please select an authorized signatory from the signatory dropdown");
      return;
    }

    const cleanedTerms = terms.map((t) => t.trim()).filter(Boolean);

    const payload: CreateQuotationPayload = {
      ref_no: refNo.trim() || undefined,
      customer_ref: customerRef.trim() || undefined,
      party_id: selectedPartyId || undefined,
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
      signatory_designation: signatoryDesignation.trim() || "Authorized Signatory",
      signatory_user: signatoryUserId || undefined,
    };

    const targetLeadId = selectedLeadId || lead?._id || (typeof quotation?.lead === "object" ? quotation.lead?._id : quotation?.lead) || "";

    try {
      if (isEditing && quotation?._id) {
        const res = await updateQuotation({
          quotationId: quotation._id,
          leadId: targetLeadId || undefined,
          body: payload,
        }).unwrap();
        toast.success(`Quotation ${res.quotation_no} updated successfully`);
        onSuccess?.(res);
      } else {
        const res = await createQuotation({
          leadId: targetLeadId || undefined,
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

  if (!canManageQuotations(authUser)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
        <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Administrator Access Required
          </h3>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Only administrators (Admin, Super Admin, and Finance) are authorized to create or edit quotations.
          </p>
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            {!canManageQuotations(authUser) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Only administrators (Admin, Super Admin, and Finance) are authorized to create or update quotations.</span>
              </div>
            )}

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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-blue-600" />
                  Customer / Recipient Information
                </div>
                {selectedParty && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-2xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    <Building2 className="h-3 w-3" />
                    Party Master Linked
                  </span>
                )}
              </div>

              {/* Party Master Search & Autofill Panel */}
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5 text-blue-600" />
                    Search Party Master (Autofill Customer Details)
                  </label>
                  {selectedParty && (
                    <button
                      type="button"
                      onClick={() => handlePartySelect(null)}
                      className="text-[11px] font-bold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                    >
                      Clear / Unlink Party
                    </button>
                  )}
                </div>

                <PartySearchAutocomplete
                  parties={parties}
                  selectedPartyId={selectedPartyId}
                  onSelect={handlePartySelect}
                />

                {/* Selected Party Summary & Multiple Contacts Switcher */}
                {selectedParty && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 p-2 text-xs dark:bg-slate-900/80 border border-blue-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {selectedParty.party_name}
                      </span>
                      {selectedParty.party_code && (
                        <span className="font-mono text-[10px] text-slate-500">
                          ({selectedParty.party_code})
                        </span>
                      )}
                      {selectedParty.party_type && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 capitalize dark:bg-slate-800 dark:text-slate-300">
                          {selectedParty.party_type}
                        </span>
                      )}
                      {selectedParty.sra === true && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          SRA
                        </span>
                      )}
                      {(selectedParty.billing_address?.city || selectedParty.district) && (
                        <span className="text-[11px] text-slate-500">
                          • {selectedParty.billing_address?.city || selectedParty.district}
                        </span>
                      )}
                    </div>

                    {selectedParty.contacts && selectedParty.contacts.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-slate-500">Switch Contact:</span>
                        <select
                          value={kindAttn}
                          onChange={(e) => handlePartyContactSwitch(e.target.value)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-800 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          {selectedParty.contacts.map((c, i) => (
                            <option key={i} value={c.name || ""}>
                              {c.name} {c.department ? `(${c.department})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-blue-600" />
                  Line Items &amp; Products ({items.length})
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                  title="Add empty row for custom non-catalog item"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Custom Item
                </button>
              </div>

              {/* Quick Search & Add from Catalog */}
              <div className="relative z-20 mb-4 overflow-visible rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  Quick Search &amp; Add Products from Catalog
                  {products.length > 0 && (
                    <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-semibold normal-case tracking-normal text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                      {products.length} items
                    </span>
                  )}
                </div>
                <QuickProductSearchAndAdd
                  products={products}
                  onAddProduct={handleQuickAddProduct}
                  isLoading={isFetchingProducts}
                />
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

                          {/* Searchable catalog autocomplete in row */}
                          <ProductRowAutocomplete
                            products={products}
                            selectedId={it.product}
                            onSelect={(pId) => handleSelectProduct(idx, pId)}
                          />

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
                    Select an authorized signatory from the dropdown. Signatory details are auto-filled and locked; only designation can be edited.
                  </p>
                </div>

                {/* Selector for admin/finance/signatory users */}
                {usersList.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Choose Signatory:
                    </label>
                    <select
                      value={signatoryUserId}
                      onChange={(e) => handleSelectAdminUser(e.target.value)}
                      className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
                    >
                      <option value="">
                        -- Select Authorized Signatory (Required) --
                      </option>
                      {lead?.assigned_to &&
                        typeof lead.assigned_to === "object" &&
                        ["admin", "super_admin", "finance"].includes(lead.assigned_to.department || "") && (
                          <option value={lead.assigned_to._id}>
                            ⭐ Lead Assigned: {lead.assigned_to.name} ({lead.assigned_to.department})
                          </option>
                        )}
                      {adminUsers.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name} ({u.department}) {u.phone ? `• ${u.phone}` : ""}
                        </option>
                      ))}
                    </select>
                    {signatoryUserId && (
                      <button
                        type="button"
                        onClick={() => handleSelectAdminUser("")}
                        className="text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                        title="Clear selected signatory"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Signatory Name <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">Read-only</span>
                  </div>
                  <input
                    type="text"
                    required
                    readOnly
                    value={signatoryName}
                    placeholder="Choose signatory from dropdown..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-2 text-xs text-slate-700 shadow-xs cursor-not-allowed dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-300 font-bold"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Designation / Title
                    </label>
                    <span className="text-[10px] text-blue-600 font-bold dark:text-blue-400">Editable</span>
                  </div>
                  <input
                    type="text"
                    value={signatoryDesignation}
                    onChange={(e) => setSignatoryDesignation(e.target.value)}
                    placeholder="e.g. Authorized Signatory / Director"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white font-medium"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Contact Phone / Mobile
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">Read-only</span>
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={signatoryPhone}
                    placeholder="Auto-filled from profile"
                    className="w-full rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-2 text-xs text-slate-700 shadow-xs cursor-not-allowed dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-300 font-medium"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Official Email
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">Read-only</span>
                  </div>
                  <input
                    type="email"
                    readOnly
                    value={signatoryEmail}
                    placeholder="Auto-filled from profile"
                    className="w-full rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-2 text-xs text-slate-700 shadow-xs cursor-not-allowed dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-300 font-medium"
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
                  {terms.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllTerms}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-white/10 dark:bg-slate-800 dark:text-rose-400 cursor-pointer"
                      title="Clear all terms"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear All
                    </button>
                  )}
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
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <label className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-blue-600" />
                        Select From Terms &amp; Conditions Master ({masterTermsSets.length} Sets Available)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllFilteredSets}
                          className="text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <button
                          type="button"
                          onClick={handleClearAllTerms}
                          className="text-[11px] font-semibold text-slate-500 hover:underline dark:text-slate-400 cursor-pointer"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {/* Filter & Search Controls */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={termsSearch}
                          onChange={(e) => setTermsSearch(e.target.value)}
                          placeholder="Search terms sets or clauses..."
                          className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="flex items-center gap-1 overflow-x-auto">
                        {(["all", "quotation", "order", "invoice", "general"] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setTermsTypeFilter(type)}
                            className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                              termsTypeFilter === type
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-white/80 text-slate-600 hover:bg-white dark:bg-slate-800/80 dark:text-slate-300 border border-slate-200 dark:border-white/10"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredTermsSets.length === 0 ? (
                      <div className="text-xs text-slate-500 py-3 text-center bg-white/50 rounded-lg dark:bg-slate-900/40">
                        No matching terms sets found. Try adjusting your search or category filter.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                        {filteredTermsSets.map((set) => {
                          const status = getSetSelectionStatus(set);
                          const activeLines = getSetLines(set);
                          const isExpanded = expandedSetIds.includes(set._id);

                          return (
                            <div
                              key={set._id}
                              className={`rounded-lg border transition ${
                                status === "all"
                                  ? "border-blue-500 bg-white dark:bg-slate-900 shadow-2xs"
                                  : status === "partial"
                                  ? "border-blue-300 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/40"
                                  : "border-slate-200 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 p-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleTermsSet(set)}
                                  className="flex items-start gap-2 flex-1 text-left cursor-pointer"
                                >
                                  <div className="mt-0.5 shrink-0 text-blue-600">
                                    {status === "all" ? (
                                      <CheckSquare className="h-4 w-4" />
                                    ) : status === "partial" ? (
                                      <div className="h-4 w-4 rounded border border-blue-600 bg-blue-600 flex items-center justify-center text-white">
                                        <Minus className="h-3 w-3 stroke-[3]" />
                                      </div>
                                    ) : (
                                      <Square className="h-4 w-4 text-slate-400" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                      <span>{set.title}</span>
                                      <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400 uppercase shrink-0">
                                        {set.type}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                      {activeLines.length} {activeLines.length === 1 ? "clause" : "clauses"}
                                      {status === "partial" && " • partially selected"}
                                      {status === "all" && " • fully selected"}
                                    </div>
                                  </div>
                                </button>

                                {activeLines.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleExpandSet(set._id)}
                                    className="shrink-0 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                    title={isExpanded ? "Collapse clauses" : "Expand clauses"}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {/* Expanded Individual Clauses */}
                              {isExpanded && activeLines.length > 0 && (
                                <div className="border-t border-slate-100 bg-slate-50/80 p-2 space-y-1.5 dark:border-white/5 dark:bg-slate-900/70 rounded-b-lg">
                                  {activeLines.map((clause, cIdx) => {
                                    const isClauseSelected = terms.some((t) => t.trim() === clause);
                                    return (
                                      <button
                                        key={cIdx}
                                        type="button"
                                        onClick={() => handleToggleClause(clause)}
                                        className={`w-full flex items-start gap-2 p-1.5 rounded-md text-left text-xs transition cursor-pointer ${
                                          isClauseSelected
                                            ? "bg-blue-100/70 text-blue-900 dark:bg-blue-950/70 dark:text-blue-200 font-medium"
                                            : "hover:bg-white text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        }`}
                                      >
                                        <div className="mt-0.5 shrink-0 text-blue-600">
                                          {isClauseSelected ? (
                                            <CheckSquare className="h-3.5 w-3.5" />
                                          ) : (
                                            <Square className="h-3.5 w-3.5 text-slate-400" />
                                          )}
                                        </div>
                                        <div className="text-[11px] leading-snug line-clamp-2">
                                          {clause}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Individual Condition Lines Editor (Printed on official PDF) */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>Proposal Condition Clauses ({terms.length} Lines)</span>
                      <span className="text-[10px] font-normal text-slate-400">
                        These clauses will be printed on the official quotation.
                      </span>
                    </div>

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
                        <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveTerm(idx, "up")}
                            disabled={idx === 0}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveTerm(idx, "down")}
                            disabled={idx === terms.length - 1}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveTerm(idx)}
                            className="rounded-md p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 cursor-pointer"
                            title="Delete Condition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {terms.length === 0 && (
                      <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl p-4 dark:border-white/10">
                        No terms and conditions selected. Choose one or multiple master sets above or click &apos;+ Add Condition&apos; to write custom terms.
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
              disabled={isCreating || isUpdating || !canManageQuotations(authUser)}
              title={!canManageQuotations(authUser) ? "Only administrators can create quotations" : undefined}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              {isCreating || isUpdating ? "Saving..." : isEditing ? "Update Quotation" : "Generate Quotation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
