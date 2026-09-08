"use client";

import { useEffect, useRef, useState } from "react";
import { Users, MapPin, Building2, TableProperties, Sparkles } from "lucide-react";
import FeaturedProductGroupSalesUserTable from "./FeaturedProductGroupSalesUserTable";
import FeaturedProductGroupZoneTable from "./FeaturedProductGroupZoneTable";
import FeaturedProductGroupFeaturedPartyTable from "./FeaturedProductGroupFeaturedPartyTable";
import { useFeaturedMatrixCatalog } from "./useFeaturedMatrixCatalog";
import type { MatrixQtyBasis } from "./featuredMatrixUtils";

interface FeaturedMatrixSectionProps {
  orders: any[];
  isOrdersFetching: boolean;
  externalFilterCaption?: string;
  qtyBasis?: MatrixQtyBasis;
}

type MatrixTab = "sales" | "zone" | "party";

export default function FeaturedMatrixSection({
  orders,
  isOrdersFetching,
  externalFilterCaption,
  qtyBasis = "approved",
}: FeaturedMatrixSectionProps) {
  const [activeTab, setActiveTab] = useState<MatrixTab>("sales");
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isInView) return;
    const el = containerRef.current;
    if (!el) return;

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "350px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isInView]);

  const catalog = useFeaturedMatrixCatalog({ enabled: isInView });

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Matrix Navigation Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md">
            <TableProperties className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                Featured Product Matrix Breakdown
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/40 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                <Sparkles className="size-3 text-purple-600 dark:text-purple-400" />
                Featured Analysis
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Multi-dimensional cross-tabulation of featured product groups across sales team, zones, and key parties.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/50 dark:border-white/5 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "sales"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Users className="size-3.5" />
            <span>By Sales Person</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("zone")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "zone"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <MapPin className="size-3.5" />
            <span>By Zone</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("party")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "party"
                ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Building2 className="size-3.5" />
            <span>By Featured Party</span>
          </button>
        </div>
      </div>

      {/* Active Matrix Content */}
      <div className="min-h-[300px]">
        {activeTab === "sales" && (
          <FeaturedProductGroupSalesUserTable
            orders={orders}
            isOrdersFetching={isOrdersFetching}
            externalFilterCaption={externalFilterCaption}
            qtyBasis={qtyBasis}
            catalog={catalog}
            enabled={isInView}
          />
        )}

        {activeTab === "zone" && (
          <FeaturedProductGroupZoneTable
            orders={orders}
            isOrdersFetching={isOrdersFetching}
            externalFilterCaption={externalFilterCaption}
            qtyBasis={qtyBasis}
            catalog={catalog}
            enabled={isInView}
          />
        )}

        {activeTab === "party" && (
          <FeaturedProductGroupFeaturedPartyTable
            orders={orders}
            isOrdersFetching={isOrdersFetching}
            externalFilterCaption={externalFilterCaption}
            qtyBasis={qtyBasis}
            catalog={catalog}
            enabled={isInView}
          />
        )}
      </div>
    </div>
  );
}
