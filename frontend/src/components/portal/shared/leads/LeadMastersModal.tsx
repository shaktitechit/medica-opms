/**
 * @fileoverview Modal for managing Lead Sources and Lead Lost Reasons masters.
 * @module components/portal/shared/leads/LeadMastersModal
 */
"use client";

import React, { useState } from "react";
import { Settings, Plus, Trash2, X, Tag, AlertTriangle } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useListLeadSourcesQuery,
  useCreateLeadSourceMutation,
  useDeleteLeadSourceMutation,
  useListLeadLostReasonsQuery,
  useCreateLeadLostReasonMutation,
  useDeleteLeadLostReasonMutation,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function LeadMastersModal({ open, onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<"sources" | "lost_reasons">("sources");
  const [newSourceName, setNewSourceName] = useState<string>("");
  const [newReasonName, setNewReasonName] = useState<string>("");

  const { data: sources } = useListLeadSourcesQuery(undefined, { skip: !open });
  const { data: lostReasons } = useListLeadLostReasonsQuery(undefined, { skip: !open });

  const [createSource, { isLoading: creatingSource }] = useCreateLeadSourceMutation();
  const [deleteSource] = useDeleteLeadSourceMutation();

  const [createReason, { isLoading: creatingReason }] = useCreateLeadLostReasonMutation();
  const [deleteReason] = useDeleteLeadLostReasonMutation();

  if (!open) return null;

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim()) return;
    try {
      await createSource({ name: newSourceName.trim() }).unwrap();
      toast.success("Lead source added");
      setNewSourceName("");
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleAddReason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReasonName.trim()) return;
    try {
      await createReason({ name: newReasonName.trim() }).unwrap();
      toast.success("Lost reason added");
      setNewReasonName("");
      if (onSuccess) onSuccess();
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
          className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lead Masters Configuration
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure dynamic lead channels and outcome reasons
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

          <div className="mt-4 flex gap-2 border-b border-slate-100 pb-2 dark:border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("sources")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === "sources"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
              }`}
            >
              Lead Sources ({sources?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("lost_reasons")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === "lost_reasons"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
              }`}
            >
              Lost Reasons ({lostReasons?.length || 0})
            </button>
          </div>

          {activeTab === "sources" && (
            <div className="mt-4 space-y-4">
              <form onSubmit={handleAddSource} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="New Lead Source (e.g. LinkedIn, Trade Fair)..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={creatingSource || !newSourceName.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </form>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {sources?.map((s) => (
                  <div
                    key={s._id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 dark:border-white/5 dark:bg-slate-800/30 dark:text-white"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-semibold">{s.name}</span>
                    </div>
                    {!s.is_system && (
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteSource(s._id);
                          if (onSuccess) onSuccess();
                        }}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "lost_reasons" && (
            <div className="mt-4 space-y-4">
              <form onSubmit={handleAddReason} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newReasonName}
                  onChange={(e) => setNewReasonName(e.target.value)}
                  placeholder="New Lost Reason (e.g. Credit Term Disagreement)..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={creatingReason || !newReasonName.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </form>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {lostReasons?.map((r) => (
                  <div
                    key={r._id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 dark:border-white/5 dark:bg-slate-800/30 dark:text-white"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-semibold">{r.name}</span>
                    </div>
                    {!r.is_system && (
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteReason(r._id);
                          if (onSuccess) onSuccess();
                        }}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Done
            </button>
          </div>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}
