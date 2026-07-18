"use client";

import { useCallback, useEffect, useState } from "react";

import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateProductMutation,
  useGetProductQuery,
  usePatchProductMutation,
  useGetProductMetaOptionsQuery,
} from "@/store/api";
import { productRefLabel } from "./productRefLabel";

export type ProductDetailModalProps = {
  productId: string | null;
  create?: boolean;
  onClose: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

const UNIT_OPTIONS = [
  "pcs",
  "box",
  "kg",
  "ltr",
  "meter",
  "set",
  "kit",
  "bottle",
] as const;

function stringField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function numField(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
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

type ProductState = {
  product_name: string;
  generic_name: string;
  sku: string;
  product_group: string;
  product_subgroup: string;
  brand: string;
  manufacturer: string;
  unit: "pcs" | "box" | "kg" | "ltr" | "meter" | "set" | "kit" | "bottle";
  base_price: string;
  minimum_sale_rate: string;
  mrp: string;
  gst_percent: string;
  warranty_months: string;
  description: string;
  aliases: string; // Comma separated
  tags: string; // Comma separated
  is_active: boolean;
  is_featured: boolean;
};

const defaultProductState = (): ProductState => ({
  product_name: "",
  generic_name: "",
  sku: "",
  product_group: "",
  product_subgroup: "",
  brand: "",
  manufacturer: "",
  unit: "pcs",
  base_price: "",
  minimum_sale_rate: "",
  mrp: "",
  gst_percent: "18",
  warranty_months: "0",
  description: "",
  aliases: "",
  tags: "",
  is_active: true,
  is_featured: false,
});

export function ProductDetailModal({
  productId,
  create = false,
  onClose,
}: ProductDetailModalProps) {
  const show = create || (productId != null && productId !== "");
  const isEditing = productId != null && productId !== "";

  // Query details
  const { data: rawProduct, isFetching } = useGetProductQuery(productId ?? "", {
    skip: !isEditing,
  });

  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation();
  const [patchProduct, { isLoading: isPatching }] = usePatchProductMutation();
  const { data: metaOptions } = useGetProductMetaOptionsQuery(undefined, { skip: !show });
  const isSaving = isCreating || isPatching;

  // Local Form state
  const [form, setForm] = useState<ProductState>(defaultProductState());
  const [activeTab, setActiveTab] = useState<"basic" | "commercial">("basic");

  // Sync details to form state
  useEffect(() => {
    if (rawProduct && typeof rawProduct === "object") {
      const p = rawProduct as any;
      const als = Array.isArray(p.aliases) ? p.aliases.join(", ") : "";
      const tgs = Array.isArray(p.tags) ? p.tags.join(", ") : "";

      setForm({
        product_name: stringField(p.product_name),
        generic_name: stringField(p.generic_name),
        sku: stringField(p.sku),
        product_group: productRefLabel(p.product_group),
        product_subgroup: productRefLabel(p.product_subgroup),
        brand: productRefLabel(p.brand),
        manufacturer: productRefLabel(p.manufacturer),
        unit: UNIT_OPTIONS.includes(p.unit) ? p.unit : "pcs",
        base_price: numField(p.base_price),
        minimum_sale_rate: numField(p.minimum_sale_rate),
        mrp: numField(p.mrp),
        gst_percent: numField(p.gst_percent ?? 18),
        warranty_months: numField(p.warranty_months ?? 0),
        description: stringField(p.description),
        aliases: als,
        tags: tgs,
        is_active: p.is_active !== false,
        is_featured: p.is_featured === true,
      });
    } else if (create) {
      setForm(defaultProductState());
    }
  }, [rawProduct, create]);

  // Clean form when modal closes
  useEffect(() => {
    if (!show) {
      setForm(defaultProductState());
      setActiveTab("basic");
    }
  }, [show]);

  // Keyboard shortcut escape
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
    if (!form.product_name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const bp = Number(form.base_price);
    if (form.base_price === "" || isNaN(bp) || bp < 0) {
      toast.error("Valid base price is required");
      return;
    }
    const msr = Number(form.minimum_sale_rate);
    if (form.minimum_sale_rate === "" || isNaN(msr) || msr < 0) {
      toast.error("Valid minimum sale rate is required");
      return;
    }

    const aliasesArr = form.aliases
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tagsArr = form.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, any> = {
      product_name: form.product_name.trim(),
      generic_name: form.generic_name.trim() || undefined,
      sku: form.sku.trim() || undefined,
      product_group: form.product_group.trim() || undefined,
      product_subgroup: form.product_subgroup.trim() || undefined,
      brand: form.brand.trim() || undefined,
      manufacturer: form.manufacturer.trim() || undefined,
      unit: form.unit,
      base_price: bp,
      minimum_sale_rate: msr,
      mrp: form.mrp ? Number(form.mrp) : undefined,
      gst_percent: Number(form.gst_percent),
      warranty_months: Number(form.warranty_months),
      description: form.description.trim() || undefined,
      aliases: aliasesArr,
      tags: tagsArr,
      is_active: form.is_active,
      is_featured: form.is_featured,
    };

    try {
      if (create) {
        await createProduct(payload).unwrap();
        toast.success(mutationSuccessCopy("createProduct"));
        onClose();
      } else if (productId) {
        // Minimal Diff payload calculation
        const pObj = rawProduct as any;
        const patch: Record<string, any> = {};

        const oldGroup = productRefLabel(pObj.product_group);
        const oldSubgroup = productRefLabel(pObj.product_subgroup);
        const oldBrand = productRefLabel(pObj.brand);
        const oldManufacturer = productRefLabel(pObj.manufacturer);

        if (!valsEqual(form.product_name.trim(), pObj.product_name)) patch.product_name = form.product_name.trim();
        if (!valsEqual(form.generic_name.trim(), pObj.generic_name)) patch.generic_name = form.generic_name.trim() || null;
        if (!valsEqual(form.sku.trim(), pObj.sku)) patch.sku = form.sku.trim() || null;
        if (!valsEqual(form.product_group.trim(), oldGroup)) patch.product_group = form.product_group.trim() || null;
        if (!valsEqual(form.product_subgroup.trim(), oldSubgroup)) patch.product_subgroup = form.product_subgroup.trim() || null;
        if (!valsEqual(form.brand.trim(), oldBrand)) patch.brand = form.brand.trim() || null;
        if (!valsEqual(form.manufacturer.trim(), oldManufacturer)) patch.manufacturer = form.manufacturer.trim() || null;
        if (form.unit !== pObj.unit) patch.unit = form.unit;
        if (bp !== pObj.base_price) patch.base_price = bp;
        if (msr !== pObj.minimum_sale_rate) patch.minimum_sale_rate = msr;
        
        const oldMrp = pObj.mrp == null ? "" : String(pObj.mrp);
        if (form.mrp !== oldMrp) patch.mrp = form.mrp ? Number(form.mrp) : null;

        if (Number(form.gst_percent) !== pObj.gst_percent) patch.gst_percent = Number(form.gst_percent);
        if (Number(form.warranty_months) !== pObj.warranty_months) patch.warranty_months = Number(form.warranty_months);
        if (!valsEqual(form.description.trim(), pObj.description)) patch.description = form.description.trim() || "";

        // Compare string arrays
        const oldAliases = Array.isArray(pObj.aliases) ? pObj.aliases : [];
        if (JSON.stringify(aliasesArr) !== JSON.stringify(oldAliases)) {
          patch.aliases = aliasesArr;
        }

        const oldTags = Array.isArray(pObj.tags) ? pObj.tags : [];
        if (JSON.stringify(tagsArr) !== JSON.stringify(oldTags)) {
          patch.tags = tagsArr;
        }

        if (form.is_active !== (pObj.is_active !== false)) patch.is_active = form.is_active;
        if (form.is_featured !== (pObj.is_featured === true)) patch.is_featured = form.is_featured;

        if (Object.keys(patch).length === 0) {
          toast.info("No modifications detected");
          onClose();
          return;
        }

        await patchProduct({ id: productId, patch }).unwrap();
        toast.success(mutationSuccessCopy("patchProduct"));
        onClose();
      }
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [form, create, productId, rawProduct, createProduct, patchProduct, onClose]);

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
              {create ? "Add Product" : isFetching ? "Loading Product Details..." : form.product_name || "Product Detail"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {create ? "Create catalog product profile" : "View or edit catalog specifications and pricing"}
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
            onClick={() => setActiveTab("basic")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "basic"
                ? "border-b-blue-600 text-blue-600 dark:border-b-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Basic Specs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("commercial")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "commercial"
                ? "border-b-blue-600 text-blue-600 dark:border-b-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Commercial & Compliance
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
          {isFetching && !create ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading catalog files...</p>
          ) : activeTab === "basic" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Product Name *</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Paracetamol 500mg IP"
                  value={form.product_name}
                  onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Generic Name</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Acetaminophen"
                  value={form.generic_name}
                  onChange={(e) => setForm((f) => ({ ...f, generic_name: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>SKU / Catalog No</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. PAR-500"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Commercial Group</label>
                <input
                  type="text"
                  list="group-options"
                  className={inputClass}
                  placeholder="e.g. Tablets"
                  value={form.product_group}
                  onChange={(e) => setForm((f) => ({ ...f, product_group: e.target.value }))}
                  disabled={isSaving}
                />
                <datalist id="group-options">
                  {metaOptions?.groups?.map(g => (
                    <option key={g._id} value={g.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Subgroup</label>
                <input
                  type="text"
                  list="subgroup-options"
                  className={inputClass}
                  placeholder="e.g. Analgesics"
                  value={form.product_subgroup}
                  onChange={(e) => setForm((f) => ({ ...f, product_subgroup: e.target.value }))}
                  disabled={isSaving}
                />
                <datalist id="subgroup-options">
                  {metaOptions?.subgroups?.map(sg => (
                    <option key={sg._id} value={sg.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Brand</label>
                <input
                  type="text"
                  list="brand-options"
                  className={inputClass}
                  placeholder="e.g. Crocin"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  disabled={isSaving}
                />
                <datalist id="brand-options">
                  {metaOptions?.brands?.map(b => (
                    <option key={b._id} value={b.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Manufacturer</label>
                <input
                  type="text"
                  list="manufacturer-options"
                  className={inputClass}
                  placeholder="e.g. GSK Ltd"
                  value={form.manufacturer}
                  onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                  disabled={isSaving}
                />
                <datalist id="manufacturer-options">
                  {metaOptions?.manufacturers?.map(m => (
                    <option key={m._id} value={m.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Unit of Measurement</label>
                <select
                  className={inputClass}
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as any }))}
                  disabled={isSaving}
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  className={`${inputClass} min-h-[80px]`}
                  placeholder="Product description..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  disabled={isSaving}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>Base Price *</label>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="0.00"
                  value={form.base_price}
                  onChange={(e) => setForm((f) => ({ ...f, base_price: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Minimum Sale Rate *</label>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="0.00"
                  value={form.minimum_sale_rate}
                  onChange={(e) => setForm((f) => ({ ...f, minimum_sale_rate: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>MRP</label>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="0.00"
                  value={form.mrp}
                  onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>GST %</label>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="18"
                  value={form.gst_percent}
                  onChange={(e) => setForm((f) => ({ ...f, gst_percent: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Warranty (months)</label>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="0"
                  value={form.warranty_months}
                  onChange={(e) => setForm((f) => ({ ...f, warranty_months: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Aliases (comma-separated)</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="pcm, acetaminophen"
                  value={form.aliases}
                  onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Tags (comma-separated)</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="tablet, analgesics"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  disabled={isSaving}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-7">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pm-active"
                    className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    disabled={isSaving}
                  />
                  <label htmlFor="pm-active" className="text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    Is Catalog Active
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pm-featured"
                    className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950"
                    checked={form.is_featured}
                    onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                    disabled={isSaving}
                  />
                  <label htmlFor="pm-featured" className="text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    Featured Product
                  </label>
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
            {isSaving ? "Saving..." : create ? "Add Product" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}