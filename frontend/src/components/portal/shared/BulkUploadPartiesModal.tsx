"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useBulkCreatePartyMutation } from "@/store/api";
import {
  batchCount,
  BULK_PARTY_UPLOAD_BATCH_SIZE,
  uploadInBatches,
} from "@/lib/bulkUploadBatches";
import { canBulkUploadParties } from "@/lib/permissions";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import {
  contactsFromBulkRow,
  formatContactsSummary,
  hasContactPhone,
  type PartyContact,
} from "@/lib/partyContacts";
import { useAppSelector } from "@/store/hooks";

export type BulkUploadPartiesModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type ParsedParty = {
  party_name: string;
  party_type: "customer" | "supplier" | "both";
  contacts: PartyContact[];
  gst_no: string;
  drug_license_no: string;
  district: string;
  state: string;
  payment_terms: string;
  status: "ready" | "invalid";
  reason?: string;
  raw: Record<string, unknown>;
};

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

const VALID_TYPES = ["customer", "supplier", "both"] as const;

function pickField(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = raw[key];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const lower = raw[key.toLowerCase()];
    if (lower != null && String(lower).trim()) return String(lower).trim();
  }
  return "";
}

function parsePartyImportRow(raw: Record<string, unknown>): ParsedParty {
  const name = pickField(raw, ["party_name", "name"]);
  const party_type_raw = pickField(raw, ["party_type", "type"]) || "customer";
  const party_type = party_type_raw.toLowerCase().trim() as ParsedParty["party_type"];
  const contacts = contactsFromBulkRow(raw);
  const gst_no = pickField(raw, ["gst_no", "gst", "gstin"]);
  const drug_license_no = pickField(raw, ["drug_license_no", "dl_no"]);
  const district = pickField(raw, ["district"]);
  const state = pickField(raw, ["state"]);
  const payment_terms = pickField(raw, ["payment_terms"]);

  let status: "ready" | "invalid" = "ready";
  let reason = "";

  if (!name.trim()) {
    status = "invalid";
    reason = "Missing party name";
  } else if (!hasContactPhone(contacts)) {
    status = "invalid";
    reason = "Missing contact phone number";
  } else if (party_type_raw && !VALID_TYPES.includes(party_type)) {
    status = "invalid";
    reason = "Type must be customer, supplier, or both";
  } else {
    for (const contact of contacts) {
      if (contact.email.trim() && !/\S+@\S+\.\S+/.test(contact.email)) {
        status = "invalid";
        reason = "Invalid email format in contacts";
        break;
      }
    }
  }

  return {
    party_name: name,
    party_type: VALID_TYPES.includes(party_type) ? party_type : "customer",
    contacts,
    gst_no,
    drug_license_no,
    district,
    state,
    payment_terms,
    status,
    reason,
    raw,
  };
}

export function BulkUploadPartiesModal({
  open,
  onClose,
  onSuccess,
}: BulkUploadPartiesModalProps) {
  const user = useAppSelector((s) => s.auth.user);
  const mayBulkUpload = canBulkUploadParties(user);
  const [bulkCreateParty, { isLoading }] = useBulkCreatePartyMutation();
  const [file, setFile] = useState<File | null>(null);
  const [parsedParties, setParsedParties] = useState<ParsedParty[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadBatch, setUploadBatch] = useState<{ current: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setFile(null);
      setParsedParties([]);
      setDragActive(false);
      setUploadBatch(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isLoading, onClose]);

  const parseCSV = (text: string): ParsedParty[] => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) return [];

    const headers = lines[0].split(",").map((h) =>
      h.trim().replace(/^["']|["']$/g, "").toLowerCase()
    );

    const parsed: ParsedParty[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const raw: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        let val = values[idx] || "";
        val = val.replace(/^["']|["']$/g, "");
        raw[header] = val;
      });

      parsed.push(parsePartyImportRow(raw));
    }

    return parsed;
  };

  const handleFileChange = useCallback((selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") return;

      try {
        if (selectedFile.name.endsWith(".json")) {
          const arr = JSON.parse(text);
          if (!Array.isArray(arr)) {
            throw new Error("JSON file must be an array of party objects");
          }

          const mapped = arr.map((item: unknown) =>
            parsePartyImportRow(
              item && typeof item === "object"
                ? (item as Record<string, unknown>)
                : {},
            ),
          );
          setParsedParties(mapped);
        } else {
          setParsedParties(parseCSV(text));
        }
      } catch {
        toast.error("Failed to parse file. Ensure it is valid CSV or JSON.");
        setFile(null);
        setParsedParties([]);
      }
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileChange(e.dataTransfer.files[0]);
      }
    },
    [handleFileChange],
  );

  const downloadTemplate = useCallback(() => {
    const csvContent =
      "party_name,party_type,contact_name,contact_department,contact_phone,contact_email,contact_alternate_phone,contact_2_name,contact_2_department,contact_2_phone,contact_2_email,contact_2_alternate_phone,gst_no,drug_license_no,district,state,payment_terms\n" +
      '"Apollo Pharmacy","customer","Dr. Rajesh Kumar","Purchase","+91 9999988888","billing@apollomed.com","+91 8888877777","Mrs. Shalini Rao","Accounts","+91 7777766666","accounts@apollomed.com","","07AAAAA1111A1Z1","DL-12345/6789","Central Delhi","Delhi","Net 30"\n' +
      '"Cipla Ltd","supplier","Mr. Amit Shah","Sales","+91 8888877777","sales@cipla.com","","","","","","","27BBBBB2222B2Z2","DL-67890/1234","Mumbai","Maharashtra","Net 45"';
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "medica_parties_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const stats = useMemo(() => {
    const total = parsedParties.length;
    const ready = parsedParties.filter((p) => p.status === "ready").length;
    const invalid = total - ready;
    const uploadBatches = batchCount(
      parsedParties.filter((p) => p.status === "ready"),
      BULK_PARTY_UPLOAD_BATCH_SIZE,
    );
    return { total, ready, invalid, uploadBatches };
  }, [parsedParties]);

  const handleUpload = useCallback(async () => {
    const validPayload = parsedParties
      .filter((p) => p.status === "ready")
      .map((p) => {
        const primary = p.contacts[0];
        return {
          party_name: p.party_name,
          party_type: p.party_type,
          contacts: p.contacts,
          contact_person: primary?.name || undefined,
          mobile: primary?.phone || undefined,
          email: primary?.email || undefined,
          gst_no: p.gst_no || undefined,
          drug_license_no: p.drug_license_no || undefined,
          district: p.district || undefined,
          state: p.state || undefined,
          payment_terms: p.payment_terms || undefined,
        };
      });

    if (validPayload.length === 0) {
      toast.error("No valid parties to upload.");
      return;
    }

    if (!mayBulkUpload) {
      toast.error("Bulk party upload is allowed for Admin and Finance users only.");
      return;
    }

    try {
      const imported = await uploadInBatches(
        validPayload,
        (batch) => bulkCreateParty(batch).unwrap(),
        {
          batchSize: BULK_PARTY_UPLOAD_BATCH_SIZE,
          onProgress: (current, total) => setUploadBatch({ current, total }),
        },
      );

      setUploadBatch(null);
      toast.success(`Successfully imported ${imported} parties!`);
      onSuccess();
      onClose();
    } catch (err) {
      setUploadBatch(null);
      toast.error(mutationRejectedMessage(err));
    }
  }, [parsedParties, bulkCreateParty, onSuccess, onClose, mayBulkUpload]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !isLoading && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-upload-title"
        className="flex max-h-[min(90dvh,750px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="bulk-upload-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              Bulk Upload Parties
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Upload customer/supplier directory data via CSV or JSON file format.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3.5 dark:border-blue-950/40 dark:bg-blue-950/10">
            <div className="text-xs text-blue-800 dark:text-blue-300 max-w-xl space-y-1">
              <span className="font-semibold block">How it works:</span>
              <p>
                Required columns: <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">party_name</code>,{" "}
                <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">contact_phone</code> (or legacy{" "}
                <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">mobile</code>).
              </p>
              <p>
                Primary contact: <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">contact_name</code>,{" "}
                <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">contact_department</code>,{" "}
                <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">contact_email</code>,{" "}
                <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">contact_alternate_phone</code>.
                Add more with <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">contact_2_*</code> columns or a JSON{" "}
                <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">contacts</code> array.
              </p>
              <p>
                Large files are uploaded in batches of {BULK_PARTY_UPLOAD_BATCH_SIZE} parties per request to avoid payload size limits.
              </p>
              <p>
                Bulk import is available to <strong>Admin</strong> and <strong>Finance</strong> users.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg bg-blue-600/90 hover:bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
            >
              Download Template CSV
            </button>
          </div>

          {!file ? (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-12 px-4 transition ${
                dragActive
                  ? "border-blue-500 bg-blue-50/30 dark:border-blue-500/80 dark:bg-blue-950/10"
                  : "border-slate-300 dark:border-white/15 dark:hover:border-slate-700 hover:border-slate-400 cursor-pointer"
              }`}
              onClick={() => document.getElementById("file-input-party")?.click()}
            >
              <input
                id="file-input-party"
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-600 mb-4 border border-slate-200/50 dark:border-white/5">
                📄
              </div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Drag & drop files here, or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supports CSV or JSON (max 5MB)
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border border-slate-200/90 rounded-lg p-3 dark:border-white/10 dark:bg-slate-950/30">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setParsedParties([]);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-200"
                >
                  Clear File
                </button>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-slate-600 dark:text-slate-400">
                  Total Parsed: <span className="text-slate-900 dark:text-slate-100 font-bold">{stats.total}</span>
                </span>
                <span className="text-green-600 dark:text-green-400">
                  ● Ready: <span className="font-bold">{stats.ready}</span>
                </span>
                {stats.invalid > 0 && (
                  <span className="text-rose-600 dark:text-rose-400">
                    ● Invalid (skipped): <span className="font-bold">{stats.invalid}</span>
                  </span>
                )}
                {stats.ready > 0 && stats.uploadBatches > 1 && (
                  <span className="text-blue-600 dark:text-blue-400">
                    ● Upload batches: <span className="font-bold">{stats.uploadBatches}</span>
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10 max-h-[300px]">
                <table className="w-full text-left text-xs min-w-[1100px]">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200/90 dark:border-white/10">
                    <tr>
                      <th className="px-3 py-2 font-medium">Party Name</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Contacts</th>
                      <th className="px-3 py-2 font-medium">Primary Phone</th>
                      <th className="px-3 py-2 font-medium">Primary Email</th>
                      <th className="px-3 py-2 font-medium">GSTIN</th>
                      <th className="px-3 py-2 font-medium">District</th>
                      <th className="px-3 py-2 font-medium">State</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                    {parsedParties.map((p, idx) => {
                      const primary = p.contacts[0];
                      return (
                        <tr
                          key={idx}
                          className={`bg-white dark:bg-slate-900 ${
                            p.status === "invalid"
                              ? "bg-rose-50/20 dark:bg-rose-950/5"
                              : ""
                          }`}
                        >
                          <td className={`px-3 py-2 font-medium max-w-[180px] truncate ${p.status === "invalid" && !p.party_name ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}>
                            {p.party_name || "— (Missing)"}
                          </td>
                          <td className={`px-3 py-2 capitalize font-semibold max-w-[100px] truncate ${p.status === "invalid" && p.reason?.includes("Type") ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}`}>
                            {p.party_type || "—"}
                          </td>
                          <td className="px-3 py-2 max-w-[220px] truncate" title={formatContactsSummary(p.contacts)}>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {formatContactsSummary(p.contacts)}
                            </span>
                            {p.contacts.length > 0 ? (
                              <span className="ml-1 text-slate-500">
                                ({p.contacts.length})
                              </span>
                            ) : null}
                          </td>
                          <td className={`px-3 py-2 font-mono text-[11px] max-w-[120px] truncate ${p.status === "invalid" && p.reason?.includes("phone") ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : ""}`}>
                            {primary?.phone || "— (Missing)"}
                          </td>
                          <td className={`px-3 py-2 truncate max-w-[140px] ${p.status === "invalid" && p.reason?.includes("email") ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : ""}`}>
                            {primary?.email || "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] uppercase">
                            {p.gst_no || "—"}
                          </td>
                          <td className="px-3 py-2 max-w-[100px] truncate">
                            {p.district || "—"}
                          </td>
                          <td className="px-3 py-2 max-w-[100px] truncate">
                            {p.state || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {p.status === "ready" ? (
                              <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/10 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20">
                                Ready
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20"
                                title={p.reason}
                              >
                                Invalid: {p.reason}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/90 px-5 py-3.5 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={btnSecondaryClass}
          >
            Cancel
          </button>
          {file && stats.ready > 0 && mayBulkUpload && (
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={isLoading || parsedParties.length === 0 || stats.ready === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {isLoading
                ? uploadBatch
                  ? `Uploading batch ${uploadBatch.current}/${uploadBatch.total}…`
                  : "Uploading..."
                : `Import ${stats.ready} Parties`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
