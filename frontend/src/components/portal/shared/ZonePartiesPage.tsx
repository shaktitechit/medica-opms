"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import {
  useGetZonePartiesQuery,
  useAssociateZonePartiesMutation,
  useGetZoneSalesPersonsQuery,
  useAssociateZoneSalesPersonsMutation,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ArrowLeft, Search, Plus, Trash2, Check, MapPin, Users, UserPlus } from "lucide-react";

export type ZonePartiesPageProps = {
  portalHome?: string;
};

export default function ZonePartiesPage({
  portalHome = "/admin",
}: ZonePartiesPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const zoneId = searchParams.get("zoneId") || "";
  const zoneName = searchParams.get("zoneName") || "Zone";

  // Fetch currently associated parties
  const { data: currentParties = [], isLoading: isLoadingParties, refetch: refetchParties } = useGetZonePartiesQuery(zoneId, {
    skip: !zoneId,
  });

  // Fetch currently associated sales persons
  const { data: currentSalesPersons = [], isLoading: isLoadingSales, refetch: refetchSales } = useGetZoneSalesPersonsQuery(zoneId, {
    skip: !zoneId,
  });

  const currentPartyIds = useMemo(() => {
    return new Set(currentParties.map((p: any) => p._id));
  }, [currentParties]);

  const currentSalesPersonIds = useMemo(() => {
    return new Set(currentSalesPersons.map((u: any) => u._id));
  }, [currentSalesPersons]);

  // Catalog search state for Parties
  const [partySearchQuery, setPartySearchQuery] = useState("");
  const [debouncedPartySearch, setDebouncedPartySearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPartySearch(partySearchQuery), 350);
    return () => clearTimeout(t);
  }, [partySearchQuery]);

  const { data: partiesData, isLoading: isLoadingPartiesCatalog } = useListPartiesQuery({
    search: debouncedPartySearch,
    limit: "15",
  });

  const catalogParties = useMemo(() => {
    if (!partiesData) return [];
    if (Array.isArray(partiesData)) return partiesData;
    if (partiesData && typeof partiesData === "object") {
      const o = partiesData as any;
      if (Array.isArray(o.items)) return o.items;
      if (Array.isArray(o.data)) return o.data;
    }
    return [];
  }, [partiesData]);

  // List all users to populate the Sales Person dropdown
  const { data: usersData, isLoading: isLoadingUsers } = useListUsersQuery();

  // Catalog search state for Sales Persons
  const [salesSearchQuery, setSalesSearchQuery] = useState("");

  const salesUsers = useMemo(() => {
    let rows: any[] = [];
    if (Array.isArray(usersData)) rows = usersData;
    else if (usersData && typeof usersData === "object") {
      const o = usersData as any;
      if (Array.isArray(o.data)) rows = o.data;
      else if (Array.isArray(o.items)) rows = o.items;
    }
    // Filter specifically for 'sales' department
    return rows.filter((u: any) => u.department === "sales" && u.is_active !== false);
  }, [usersData]);

  const filteredSalesUsers = useMemo(() => {
    const q = salesSearchQuery.trim().toLowerCase();
    if (!q) return salesUsers;
    return salesUsers.filter((u) => {
      return [u.name, u.email]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [salesUsers, salesSearchQuery]);

  const [associateParties, { isLoading: isSavingParties }] = useAssociateZonePartiesMutation();
  const [associateSalesPersons, { isLoading: isSavingSales }] = useAssociateZoneSalesPersonsMutation();

  const handleAddParty = async (partyId: string) => {
    const existingIds = currentParties.map((p: any) => p._id);
    if (existingIds.includes(partyId)) return;

    try {
      await associateParties({
        id: zoneId,
        partyIds: [...existingIds, partyId],
      }).unwrap();
      toast.success("Party added to zone");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to add party");
    }
  };

  const handleRemoveParty = async (partyId: string) => {
    const existingIds = currentParties.map((p: any) => p._id);
    try {
      await associateParties({
        id: zoneId,
        partyIds: existingIds.filter((id: string) => id !== partyId),
      }).unwrap();
      toast.success("Party removed from zone");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to remove party");
    }
  };

  const handleAddSalesPerson = async (userId: string) => {
    const existingIds = currentSalesPersons.map((u: any) => u._id);
    if (existingIds.includes(userId)) return;

    try {
      await associateSalesPersons({
        id: zoneId,
        salesPersonIds: [...existingIds, userId],
      }).unwrap();
      toast.success("Sales person assigned to zone");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to assign sales person");
    }
  };

  const handleRemoveSalesPerson = async (userId: string) => {
    const existingIds = currentSalesPersons.map((u: any) => u._id);
    try {
      await associateSalesPersons({
        id: zoneId,
        salesPersonIds: existingIds.filter((id: string) => id !== userId),
      }).unwrap();
      toast.success("Sales person unassigned from zone");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to unassign sales person");
    }
  };

  const handleGoBack = () => {
    router.push(`${portalHome}/parties?view=zones`);
  };

  return (
    <div className="space-y-4">
      <PortalBusyOverlay
        active={isLoadingParties || isLoadingSales || isSavingParties || isSavingSales}
        message="Updating zone configurations..."
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGoBack}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Zone Setup: <span className="text-blue-600 dark:text-blue-400">{zoneName}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Map associated parties and assign multiple sales persons to handle this zone.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Side: Parties configuration (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-100 p-4 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="size-4 text-slate-450" />
                Associated Parties ({currentParties.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[60vh] overflow-y-auto min-h-[300px]">
              {isLoadingParties ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading associated parties...</div>
              ) : currentParties.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No parties are currently mapped to this zone.
                </div>
              ) : (
                currentParties.map((p: any) => (
                  <div key={p._id} className="flex items-center justify-between p-3.5 hover:bg-slate-55/50 dark:hover:bg-white/[0.01]">
                    <div className="min-w-0 pr-4">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {p.party_name}
                      </p>
                      <p className="text-2xs text-slate-400 truncate">
                        Type: {p.party_type} | Location: {p.district ? `${p.district}, ` : ""}{p.state || "—"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveParty(p._id)}
                      className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="size-3" />
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Search Party Catalog */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-355 mb-2">
              Add Parties from Catalog
            </h3>
            <div className="relative mb-3">
              <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
              <input
                type="text"
                value={partySearchQuery}
                onChange={(e) => setPartySearchQuery(e.target.value)}
                placeholder="Search parties by name, district, state..."
                className="w-full rounded-lg border border-slate-250 bg-white py-2 pr-4 pl-9 text-xs shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[40vh] overflow-y-auto">
              {isLoadingPartiesCatalog ? (
                <div className="p-4 text-center text-xs text-slate-500">Searching party registry...</div>
              ) : catalogParties.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-505">
                  {partySearchQuery ? "No matching parties found." : "Type above to search party catalogue."}
                </div>
              ) : (
                catalogParties.map((p: any) => {
                  const isAssociated = currentPartyIds.has(p._id);
                  return (
                    <div key={p._id} className="flex items-center justify-between py-2">
                      <div className="min-w-0 pr-4">
                        <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                          {p.party_name}
                        </p>
                        <p className="text-3xs text-slate-400">
                          {p.district ? `${p.district}, ` : ""}{p.state || ""}
                        </p>
                      </div>
                      {isAssociated ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-white/5 dark:text-slate-450">
                          <Check className="size-3.5" />
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddParty(p._id)}
                          className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 shadow-sm transition hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 cursor-pointer"
                        >
                          <Plus className="size-3" />
                          Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Sales Persons Assignment (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-100 p-4 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="size-4 text-slate-450" />
                Assigned Sales Team ({currentSalesPersons.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[40vh] overflow-y-auto min-h-[150px]">
              {isLoadingSales ? (
                <div className="p-4 text-center text-xs text-slate-505">Loading sales team...</div>
              ) : currentSalesPersons.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-505">
                  No sales persons assigned to this zone yet.
                </div>
              ) : (
                currentSalesPersons.map((u: any) => (
                  <div key={u._id} className="flex items-center justify-between p-3 hover:bg-slate-55/50 dark:hover:bg-white/[0.01]">
                    <div className="min-w-0 pr-4">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {u.name}
                      </p>
                      <p className="text-3xs text-slate-400 truncate">{u.email}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveSalesPerson(u._id)}
                      className="text-2xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:underline cursor-pointer"
                    >
                      Unassign
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Search Sales Catalog */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-355 mb-2">
              Add Sales Persons from Roster
            </h3>
            <div className="relative mb-3">
              <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
              <input
                type="text"
                value={salesSearchQuery}
                onChange={(e) => setSalesSearchQuery(e.target.value)}
                placeholder="Search sales team by name, email..."
                className="w-full rounded-lg border border-slate-250 bg-white py-2 pr-4 pl-9 text-xs shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-955 dark:text-white"
              />
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[40vh] overflow-y-auto">
              {isLoadingUsers ? (
                <div className="p-4 text-center text-xs text-slate-500">Searching sales team...</div>
              ) : filteredSalesUsers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-505">
                  {salesSearchQuery ? "No matching sales users found." : "No active sales users found."}
                </div>
              ) : (
                filteredSalesUsers.map((u: any) => {
                  const isAssigned = currentSalesPersonIds.has(u._id);
                  return (
                    <div key={u._id} className="flex items-center justify-between py-2">
                      <div className="min-w-0 pr-4">
                        <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                          {u.name}
                        </p>
                        <p className="text-3xs text-slate-400 truncate">{u.email}</p>
                      </div>
                      {isAssigned ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-white/5 dark:text-slate-450">
                          <Check className="size-3.5" />
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddSalesPerson(u._id)}
                          className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 shadow-sm transition hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 cursor-pointer"
                        >
                          <Plus className="size-3" />
                          Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
