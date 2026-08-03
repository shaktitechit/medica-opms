"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  useCreateZoneMutation,
  useGetZoneQuery,
  usePatchZoneMutation,
  type ZoneRecord,
} from "@/store/api";
import { LargeModalPortal } from "./LargeModalPortal";
import { X } from "lucide-react";

export type ZoneDetailModalProps = {
  zoneId: string | null;
  create?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-55";
const labelClass = "text-xs font-semibold text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-55 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer";
const btnPrimaryClass =
  "rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer";

export default function ZoneDetailModal({
  zoneId,
  create = false,
  onClose,
  onSuccess,
}: ZoneDetailModalProps) {
  const isEdit = !create && !!zoneId;

  const { data: zoneData, isLoading: isLoadingZone } = useGetZoneQuery(zoneId || "", {
    skip: !isEdit,
  });

  const [createZone] = useCreateZoneMutation();
  const [patchZone] = usePatchZoneMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEdit && zoneData) {
      setName(zoneData.name || "");
      setDescription(zoneData.description || "");
      setIsActive(zoneData.is_active !== false);
    } else {
      setName("");
      setDescription("");
      setIsActive(true);
    }
  }, [isEdit, zoneData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Zone Name is required");
      return;
    }

    setIsSaving(false);
    try {
      if (isEdit && zoneId) {
        await patchZone({
          id: zoneId,
          patch: { name: name.trim(), description: description.trim(), is_active: isActive },
        }).unwrap();
        toast.success("Zone updated successfully");
      } else {
        await createZone({
          name: name.trim(),
          description: description.trim(),
          is_active: isActive,
        }).unwrap();
        toast.success("Zone created successfully");
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save zone");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <LargeModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isEdit ? "Edit Zone" : "Create New Zone"}
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-150 hover:text-slate-700 dark:hover:bg-slate-850 dark:hover:text-slate-250 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-4 space-y-4">
            {isLoadingZone ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading zone details...</div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className={labelClass}>Zone Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. North Zone, West Zone"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={labelClass}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Details about territory coverage..."
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="zone-is-active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
                  />
                  <label
                    htmlFor="zone-is-active"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                  >
                    Is Active (Visible for operations)
                  </label>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-white/5">
              <button type="button" onClick={onClose} className={btnSecondaryClass} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className={btnPrimaryClass} disabled={isSaving || isLoadingZone}>
                Save Zone
              </button>
            </div>
          </form>
        </div>
      </div>
    </LargeModalPortal>
  );
}
