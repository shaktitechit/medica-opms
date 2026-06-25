"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X,
  Cloud,
  Plus,
  Trash2,
  Copy,
  Check,
  Search,
  Download,
  Info,
  ExternalLink,
  RefreshCw,
  Link2,
  FileText,
  UserPlus,
  SlidersHorizontal
} from "lucide-react";
import {
  useListPartiesQuery,
  usePatchPartyMutation,
  useCreatePartyMutation,
  useDeletePartyMutation,
  useBulkDeletePartiesMutation
} from "@/store/api";
import { toast } from "@/lib/toast";

export type GoogleSheetPartiesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type AddressDetails = {
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

type PartyContact = {
  name?: string;
  department?: string;
  phone?: string;
  email?: string;
  alternate_phone?: string;
};

type PartyRow = {
  _id: string;
  party_name: string;
  party_type: "customer" | "supplier" | "both";
  contact_person?: string;
  mobile?: string;
  email?: string;
  contacts?: PartyContact[];
  gst_no?: string;
  drug_license_no?: string;
  billing_address?: AddressDetails;
  shipping_address?: AddressDetails;
  district?: string;
  state?: string;
  payment_terms?: string;
  is_active: boolean;
  sra: boolean;
  sra_from_date?: string;
  sra_to_date?: string;
};

type SelectedCell = {
  partyId: string;
  colKey: keyof PartyRow;
} | null;

const COLUMNS: { key: keyof PartyRow; label: string; headerLetter: string; readonly?: boolean; type?: "text" | "number" | "select" | "boolean" | "date"; options?: string[] }[] = [
  { key: "party_name", label: "Party Name*", headerLetter: "A", type: "text" },
  { key: "party_type", label: "Party Type*", headerLetter: "B", type: "select", options: ["customer", "supplier", "both"] },
  { key: "contact_person", label: "Contact Person", headerLetter: "C", type: "text" },
  { key: "mobile", label: "Mobile / Phone", headerLetter: "D", type: "text" },
  { key: "email", label: "Email Address", headerLetter: "E", type: "text" },
  { key: "gst_no", label: "GSTIN No", headerLetter: "F", type: "text" },
  { key: "drug_license_no", label: "Drug License No", headerLetter: "G", type: "text" },
  { key: "district", label: "District", headerLetter: "H", type: "text" },
  { key: "state", label: "State", headerLetter: "I", type: "text" },
  { key: "payment_terms", label: "Payment Terms", headerLetter: "J", type: "text" },
  { key: "is_active", label: "Active", headerLetter: "K", type: "boolean" },
  { key: "sra", label: "SRA", headerLetter: "L", type: "boolean" },
  { key: "sra_from_date", label: "SRA From Date", headerLetter: "M", type: "date" },
  { key: "sra_to_date", label: "SRA To Date", headerLetter: "N", type: "date" }
];

function toDateString(v: unknown): string {
  if (v == null || v === "") return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

export function GoogleSheetPartiesModal({
  isOpen,
  onClose,
  onSuccess
}: GoogleSheetPartiesModalProps) {
  const [activeTab, setActiveTab] = useState<"virtual" | "real">("virtual");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [formulaValue, setFormulaValue] = useState("");
  const [localRows, setLocalRows] = useState<PartyRow[]>([]);
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [realSheetUrl, setRealSheetUrl] = useState("");
  const [copiedScript, setCopiedScript] = useState(false);
  const [drawerPartyId, setDrawerPartyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Filter panel toggle & criteria states
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterActiveStatus, setFilterActiveStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterPartyType, setFilterPartyType] = useState<"all" | "customer" | "supplier" | "both">("all");
  const [filterSraStatus, setFilterSraStatus] = useState<"all" | "sra" | "non-sra">("all");
  const [filterState, setFilterState] = useState<string>("all");

  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    localRows.forEach(r => {
      if (r.state) {
        const s = r.state.trim();
        if (s) states.add(s);
      }
    });
    return Array.from(states).sort();
  }, [localRows]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterActiveStatus !== "all" ||
      filterPartyType !== "all" ||
      filterSraStatus !== "all" ||
      filterState !== "all"
    );
  }, [filterActiveStatus, filterPartyType, filterSraStatus, filterState]);

  const handleClearFilters = () => {
    setFilterActiveStatus("all");
    setFilterPartyType("all");
    setFilterSraStatus("all");
    setFilterState("all");
  };

  // Resizable columns width state
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    party_name: 180,
    party_type: 110,
    contact_person: 140,
    mobile: 130,
    email: 160,
    gst_no: 140,
    drug_license_no: 140,
    district: 120,
    state: 120,
    payment_terms: 120,
    is_active: 80,
    sra: 80,
    sra_from_date: 120,
    sra_to_date: 120,
  });

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 120;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + deltaX);
      setColWidths(prev => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const totalWidth = useMemo(() => {
    const columnsSum = COLUMNS.reduce((sum, col) => sum + (colWidths[col.key] || 120), 0);
    return 48 + 48 + 80 + columnsSum; // 48px row numbers, 48px checkbox, 80px actions column
  }, [colWidths]);


  // RTK Queries & Mutations
  const { data, isLoading, isError, refetch } = useListPartiesQuery(
    { paginate: "false" },
    { skip: !isOpen }
  );

  const [patchParty] = usePatchPartyMutation();
  const [createParty, { isLoading: isCreating }] = useCreatePartyMutation();
  const [deleteParty, { isLoading: isDeleting }] = useDeletePartyMutation();
  const [bulkDeleteParties, { isLoading: isBulkDeleting }] = useBulkDeletePartiesMutation();

  const fetchedParties = useMemo(() => {
    return (pickList(data) as PartyRow[]).filter(Boolean);
  }, [data]);

  // Load backend parties into local state when queried
  useEffect(() => {
    if (fetchedParties.length > 0) {
      setLocalRows(fetchedParties);
    }
  }, [fetchedParties]);

  // Load real sheet URL from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("medica_linked_google_sheet_parties_url") || "";
      setRealSheetUrl(saved);
    }
  }, []);

  const handleSaveRealSheetUrl = (url: string) => {
    setRealSheetUrl(url);
    if (typeof window !== "undefined") {
      localStorage.setItem("medica_linked_google_sheet_parties_url", url);
    }
    toast.success("Google Sheet URL updated!");
  };

  // Sync formula bar input back to selected cell
  useEffect(() => {
    if (selectedCell) {
      const row = localRows.find(r => r._id === selectedCell.partyId);
      if (row) {
        const val = row[selectedCell.colKey];
        setFormulaValue(val !== undefined && val !== null ? String(val) : "");
      }
    } else {
      setFormulaValue("");
    }
  }, [selectedCell, localRows]);

  // Close modal with escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !drawerPartyId) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen, drawerPartyId, onClose]);

  // Helper to extract sheet ID for embedding
  const googleSheetEmbedUrl = useMemo(() => {
    if (!realSheetUrl) return null;
    const match = realSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/htmlembed?widget=true&headers=false`;
    }
    return null;
  }, [realSheetUrl]);

  // Selected party for drawer details editing
  const drawerParty = useMemo(() => {
    return localRows.find(r => r._id === drawerPartyId) || null;
  }, [drawerPartyId, localRows]);

  // Handle cell edit save to server
  const saveCell = useCallback(async (partyId: string, colKey: keyof PartyRow, val: any) => {
    const originalRow = fetchedParties.find(r => r._id === partyId);
    if (!originalRow) return;

    let parsedVal = val;
    if (colKey === "gst_no" && typeof val === "string") {
      parsedVal = val.trim().toUpperCase();
    }

    // Don't patch if value didn't change
    let isSame = originalRow[colKey] === parsedVal;
    if (colKey === "sra_from_date" || colKey === "sra_to_date") {
      isSame = toDateString(originalRow[colKey]) === toDateString(parsedVal);
    }
    if (isSame) return;

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      await patchParty({
        id: partyId,
        patch: { [colKey]: parsedVal }
      }).unwrap();

      // Update local row state
      setLocalRows(prev =>
        prev.map(row => (row._id === partyId ? { ...row, [colKey]: parsedVal } : row))
      );
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to sync update to server");
      setLocalRows(fetchedParties);
    } finally {
      setSavingRows(prev => ({ ...prev, [partyId]: false }));
    }
  }, [fetchedParties, patchParty]);

  // Save Address field to backend
  const saveAddress = async (partyId: string, addressType: "billing_address" | "shipping_address", field: keyof AddressDetails, val: string) => {
    const row = localRows.find(r => r._id === partyId);
    if (!row) return;

    const currentAddress = row[addressType] || {};
    if (currentAddress[field] === val) return;

    const updatedAddress = { ...currentAddress, [field]: val };

    // Update local rows state instantly
    setLocalRows(prev =>
      prev.map(r => r._id === partyId ? { ...r, [addressType]: updatedAddress } : r)
    );

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      await patchParty({
        id: partyId,
        patch: { [addressType]: updatedAddress }
      }).unwrap();
    } catch (err: any) {
      toast.error("Failed to save address details");
      refetch();
    } finally {
      setSavingRows(prev => ({ ...prev, [partyId]: false }));
    }
  };

  // Copy Billing address to Shipping address
  const handleCopyBillingToShipping = async (partyId: string) => {
    const row = localRows.find(r => r._id === partyId);
    if (!row || !row.billing_address) return;

    const billing = row.billing_address;
    setLocalRows(prev =>
      prev.map(r => r._id === partyId ? { ...r, shipping_address: billing } : r)
    );

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      await patchParty({
        id: partyId,
        patch: { shipping_address: billing }
      }).unwrap();
      toast.success("Billing address copied to Shipping address!");
    } catch (err) {
      toast.error("Failed to copy address");
      refetch();
    } finally {
      setSavingRows(prev => ({ ...prev, [partyId]: false }));
    }
  };

  // Update a specific contact field locally
  const handleContactFieldChange = (partyId: string, index: number, field: keyof PartyContact, val: string) => {
    setLocalRows(prev =>
      prev.map(r => {
        if (r._id === partyId) {
          const currentContacts = [...(r.contacts || [])];
          currentContacts[index] = { ...currentContacts[index], [field]: val };
          return { ...r, contacts: currentContacts };
        }
        return r;
      })
    );
  };

  // Save the full contacts array to backend on blur
  const saveContacts = async (partyId: string) => {
    const row = localRows.find(r => r._id === partyId);
    if (!row) return;

    const contactsList = row.contacts || [];

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      const result = await patchParty({
        id: partyId,
        patch: { contacts: contactsList }
      }).unwrap();

      const updatedParty = result as PartyRow;
      setLocalRows(prev =>
        prev.map(r =>
          r._id === partyId
            ? {
              ...r,
              contact_person: updatedParty.contact_person,
              mobile: updatedParty.mobile,
              email: updatedParty.email
            }
            : r
        )
      );
    } catch (err: any) {
      toast.error("Failed to sync contact list");
      refetch();
    } finally {
      setSavingRows(prev => ({ ...prev, [partyId]: false }));
    }
  };

  // Add contact card
  const handleAddContact = async (partyId: string) => {
    const row = localRows.find(r => r._id === partyId);
    if (!row) return;

    const currentContacts = [...(row.contacts || [])];
    const newContact: PartyContact = { name: "New Contact", department: "", phone: "", email: "", alternate_phone: "" };
    const updatedContacts = [...currentContacts, newContact];

    setLocalRows(prev =>
      prev.map(r => r._id === partyId ? { ...r, contacts: updatedContacts } : r)
    );

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      const result = await patchParty({
        id: partyId,
        patch: { contacts: updatedContacts }
      }).unwrap();

      const updatedParty = result as PartyRow;
      setLocalRows(prev =>
        prev.map(r =>
          r._id === partyId
            ? {
              ...r,
              contact_person: updatedParty.contact_person,
              mobile: updatedParty.mobile,
              email: updatedParty.email
            }
            : r
        )
      );
      toast.success("Contact card added!");
    } catch (err) {
      toast.error("Failed to add contact");
      refetch();
    } finally {
      setSavingRows(prev => ({ ...prev, [partyId]: false }));
    }
  };

  // Delete contact card
  const handleDeleteContact = async (partyId: string, index: number) => {
    const row = localRows.find(r => r._id === partyId);
    if (!row) return;

    const currentContacts = [...(row.contacts || [])];
    const updatedContacts = currentContacts.filter((_, i) => i !== index);

    setLocalRows(prev =>
      prev.map(r => r._id === partyId ? { ...r, contacts: updatedContacts } : r)
    );

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      const result = await patchParty({
        id: partyId,
        patch: { contacts: updatedContacts }
      }).unwrap();

      const updatedParty = result as PartyRow;
      setLocalRows(prev =>
        prev.map(r =>
          r._id === partyId
            ? {
              ...r,
              contact_person: updatedParty.contact_person,
              mobile: updatedParty.mobile,
              email: updatedParty.email
            }
            : r
        )
      );
      toast.success("Contact card removed");
    } catch (err) {
      toast.error("Failed to remove contact");
      refetch();
    } finally {
      setSavingRows(prev => ({ ...prev, [partyId]: false }));
    }
  };

  // Add a party row
  const handleAddRow = async () => {
    try {
      await createParty({
        party_name: "New Party",
        party_type: "customer",
        is_active: true
      }).unwrap();

      toast.success("Added new party row!");
      refetch();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error("Failed to create party");
    }
  };

  // Delete a party row
  const handleDeleteRow = async (partyId: string) => {
    if (!confirm("Are you sure you want to delete this party?")) return;
    try {
      await deleteParty(partyId).unwrap();
      toast.success("Party deleted successfully");
      refetch();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error("Failed to delete party");
    }
  };

  // Filtered rows for virtual sheet search and filter panel criteria
  const filteredRows = useMemo(() => {
    let rows = localRows;

    // 1. Text Search Query Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        r =>
          r.party_name?.toLowerCase().includes(query) ||
          r.party_type?.toLowerCase().includes(query) ||
          r.contact_person?.toLowerCase().includes(query) ||
          r.mobile?.toLowerCase().includes(query) ||
          r.email?.toLowerCase().includes(query) ||
          r.gst_no?.toLowerCase().includes(query) ||
          r.district?.toLowerCase().includes(query) ||
          r.state?.toLowerCase().includes(query)
      );
    }

    // 2. Active Status Filter
    if (filterActiveStatus !== "all") {
      const wantActive = filterActiveStatus === "active";
      rows = rows.filter(r => r.is_active === wantActive);
    }

    // 3. Party Type Filter
    if (filterPartyType !== "all") {
      rows = rows.filter(r => r.party_type === filterPartyType);
    }

    // 4. SRA Status Filter
    if (filterSraStatus !== "all") {
      const wantSra = filterSraStatus === "sra";
      rows = rows.filter(r => r.sra === wantSra);
    }

    // 5. State Filter
    if (filterState !== "all") {
      rows = rows.filter(r => r.state?.trim() === filterState);
    }

    return rows;
  }, [
    localRows,
    searchQuery,
    filterActiveStatus,
    filterPartyType,
    filterSraStatus,
    filterState
  ]);

  const selectedCount = useMemo(() => {
    return Object.keys(selectedIds).filter(id => selectedIds[id] && localRows.some(r => r._id === id)).length;
  }, [selectedIds, localRows]);

  const isAllSelected = useMemo(() => {
    if (filteredRows.length === 0) return false;
    return filteredRows.every(r => selectedIds[r._id]);
  }, [filteredRows, selectedIds]);

  const handleToggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = { ...prev };
      if (isAllSelected) {
        filteredRows.forEach(r => {
          delete next[r._id];
        });
      } else {
        filteredRows.forEach(r => {
          next[r._id] = true;
        });
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Object.keys(selectedIds).filter(id => selectedIds[id] && localRows.some(r => r._id === id));
    if (idsToDelete.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${idsToDelete.length} selected parties?`)) return;

    try {
      await bulkDeleteParties(idsToDelete).unwrap();
      toast.success(`Successfully deleted ${idsToDelete.length} parties`);
      setSelectedIds({});
      refetch();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to delete selected parties");
    }
  };

  // Copy apps script code
  const copyScriptCode = () => {
    const code = `/**
 * Google Sheets App Script for OPMS Parties Live-Sync
 * Paste this inside Extensions -> Apps Script in your Google Sheet.
 */

// Configuration
var BACKEND_WEBHOOK_URL = "${typeof window !== "undefined" ? window.location.origin : "http://localhost:5000"}/api/parties/google-sheet-webhook?secret=medica-gsheet-sync-secret";

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  
  // Skip header row
  if (row === 1) return;
  
  // Get all header labels
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  // Get all edited row values
  var rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var payload = {};
  for (var i = 0; i < headers.length; i++) {
    var rawHeader = headers[i].toString().trim().toLowerCase();
    var key = rawHeader
      .replace(/\\*/g, "") // remove required asterisks
      .replace(/[^a-z0-9_]/g, "_") // sanitize spaces to underscores
      .replace(/__+/g, "_")
      .trim();
      
    // Handle mapping standard field names
    if (key === "party_id" || key === "id") key = "_id";
    if (key === "party_name" || key === "name") key = "party_name";
    if (key === "party_type" || key === "type") key = "party_type";
    if (key === "contact_person" || key === "contact") key = "contact_person";
    if (key === "mobile" || key === "phone") key = "mobile";
    if (key === "gstin" || key === "gstin_no") key = "gst_no";
    if (key === "active") key = "is_active";
    if (key === "sra_start" || key === "sra_start_date") key = "sra_from_date";
    if (key === "sra_end" || key === "sra_end_date") key = "sra_to_date";
    
    payload[key] = rowData[i];
  }
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(BACKEND_WEBHOOK_URL, options);
    var resText = response.getContentText();
    var code = response.getResponseCode();
    
    if (code === 200 || code === 201) {
      var resData = JSON.parse(resText);
      if (resData.success && resData.data && resData.data._id && !rowData[0]) {
        // Automatically write back the new MongoDB _id to Column A (Party ID)
        sheet.getRange(row, 1).setValue(resData.data._id);
      }
    }
  } catch (err) {
    Logger.log("Sync error: " + err.toString());
  }
}`;
    navigator.clipboard.writeText(code);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
    toast.success("Script copied to clipboard!");
  };

  // Trigger export of current sheet view
  const exportToCSV = () => {
    if (localRows.length === 0) return;
    const headers = COLUMNS.map(c => c.label).join(",");
    const csvRows = localRows.map(row => {
      return COLUMNS.map(col => {
        const val = row[col.key];
        const stringified = val !== undefined && val !== null ? String(val) : "";
        return `"${stringified.replace(/"/g, '""')}"`;
      }).join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `medica_parties_sync_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const isSavingAny = Object.values(savingRows).some(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans" role="dialog" aria-modal="true">
      {/* Top Main Google Sheets-Style Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-900 px-4 py-2.5 shrink-0 select-none">
        <div className="flex items-center gap-3">
          {/* Sheets Premium Logo */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-650 text-white font-semibold text-lg shadow shadow-emerald-500/20">
            👥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100">
                Parties Master Spreadsheet
              </span>
              {/* Sync Status Badge */}
              <div className="flex items-center gap-1 text-[11px] rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 border border-slate-200 dark:border-slate-700 text-slate-550 dark:text-slate-400">
                {isSavingAny ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="h-3 w-3 text-emerald-400" />
                    <span>Saved to Cloud</span>
                  </>
                )}
              </div>
            </div>
            {/* Nav Menus Mock */}
            <div className="mt-1 flex items-center gap-3.5 text-xs text-slate-500 dark:text-slate-400">
              <button onClick={exportToCSV} className="hover:text-slate-900 dark:hover:text-slate-100 transition">File (Export CSV)</button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button onClick={() => void refetch()} className="hover:text-slate-900 dark:hover:text-slate-100 transition flex items-center gap-1">
                🔄 Reload
              </button>
            </div>
          </div>
        </div>

        {/* Tabs Control & Close */}
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab("virtual")}
              className={`rounded-md px-3.5 py-1 text-xs font-semibold transition ${activeTab === "virtual"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
            >
              Virtual Sheet (Instant)
            </button>
            <button
              onClick={() => setActiveTab("real")}
              className={`rounded-md px-3.5 py-1 text-xs font-semibold transition ${activeTab === "real"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
            >
              Real Google Sheet Connection
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
            title="Exit full screen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      {activeTab === "virtual" ? (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-950 relative">
          {/* Sheets Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 shrink-0">
            {/* Toolbar Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleAddRow}
                disabled={isCreating}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-3.5 py-1.5 text-xs font-bold text-white shadow shadow-emerald-500/10 transition disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Row</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
              {selectedCount > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-750 active:scale-[0.98] px-3.5 py-1.5 text-xs font-bold text-white shadow shadow-rose-500/10 transition disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Selected ({selectedCount})</span>
                </button>
              )}
            </div>

            {/* Filter Search & Dropdown Controls */}
            <div className="flex items-center gap-2 relative">
              {/* Search input */}
              <div className="relative w-60">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 dark:text-slate-555 pointer-events-none">
                  <Search className="h-3.5 w-3.5" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search cell values in spreadsheet..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {/* Filters Toggle Button */}
              <button
                onClick={() => setIsFilterPanelOpen(prev => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition relative ${
                  isFilterPanelOpen || hasActiveFilters
                    ? "border-emerald-500 bg-emerald-50/10 text-emerald-600 dark:text-emerald-400"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filters</span>
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                )}
              </button>

              {/* Clear Filters helper */}
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 px-1 py-1.5 transition"
                  title="Clear all active filters"
                >
                  Clear
                </button>
              )}

              {/* Filter Panel Dropdown Popover */}
              {isFilterPanelOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsFilterPanelOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-4 z-50 space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">Sheet Filters</span>
                      <button
                        onClick={handleClearFilters}
                        disabled={!hasActiveFilters}
                        className="text-[10px] text-slate-400 hover:text-emerald-500 disabled:opacity-50 transition"
                      >
                        Reset All
                      </button>
                    </div>

                    {/* Filter fields list */}
                    <div className="space-y-3 select-none">
                      {/* Status select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Party Status</label>
                        <select
                          value={filterActiveStatus}
                          onChange={e => setFilterActiveStatus(e.target.value as any)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All statuses</option>
                          <option value="active">Active Only</option>
                          <option value="inactive">Inactive Only</option>
                        </select>
                      </div>

                      {/* Party Type select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Party Type</label>
                        <select
                          value={filterPartyType}
                          onChange={e => setFilterPartyType(e.target.value as any)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All types</option>
                          <option value="customer">Customer Only</option>
                          <option value="supplier">Supplier Only</option>
                          <option value="both">Both Only</option>
                        </select>
                      </div>

                      {/* SRA Status select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">SRA Status</label>
                        <select
                          value={filterSraStatus}
                          onChange={e => setFilterSraStatus(e.target.value as any)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All SRA options</option>
                          <option value="sra">SRA Only</option>
                          <option value="non-sra">Non-SRA Only</option>
                        </select>
                      </div>

                      {/* State select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">State</label>
                        <select
                          value={filterState}
                          onChange={e => setFilterState(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All states</option>
                          {uniqueStates.map(stateName => (
                            <option key={stateName} value={stateName}>{stateName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Formula Bar */}
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-1.5 text-xs select-none shrink-0 font-mono">
            <span className="text-slate-450 dark:text-slate-555 font-semibold select-none pr-3">fx</span>
            <span className="text-slate-300 dark:text-slate-700 px-1 border-r border-slate-200 dark:border-slate-700 mr-3">|</span>
            <input
              type="text"
              value={formulaValue}
              onChange={e => {
                setFormulaValue(e.target.value);
                if (selectedCell) {
                  setLocalRows(prev =>
                    prev.map(row =>
                      row._id === selectedCell.partyId
                        ? { ...row, [selectedCell.colKey]: e.target.value }
                        : row
                    )
                  );
                }
              }}
              onBlur={() => {
                if (selectedCell) {
                  saveCell(selectedCell.partyId, selectedCell.colKey, formulaValue);
                }
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && selectedCell) {
                  saveCell(selectedCell.partyId, selectedCell.colKey, formulaValue);
                  setSelectedCell(null);
                }
              }}
              disabled={!selectedCell || COLUMNS.find(c => c.key === selectedCell.colKey)?.readonly}
              placeholder={selectedCell ? "Enter value..." : "Select a cell to edit its formula/content"}
              className="flex-1 bg-transparent text-slate-800 dark:text-slate-200 outline-none placeholder-slate-400 dark:placeholder-slate-650"
            />
          </div>

          {/* The Spreadsheet Grid Table */}
          <div className="flex-1 overflow-auto min-h-0 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-[1px] z-10">
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="h-7 w-7 animate-spin text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-400">Loading party profiles...</span>
                </div>
              </div>
            )}

            <table className="text-left text-xs border-collapse table-fixed" style={{ width: totalWidth }}>
              {/* Header row */}
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-20 text-slate-550 dark:text-slate-400 font-semibold font-mono">
                <tr>
                  <th className="w-12 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850" style={{ width: 48, minWidth: 48, maxWidth: 48 }}></th>
                  <th className="w-12 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded border-slate-350 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </th>
                  <th className="w-20 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850" style={{ width: 80, minWidth: 80, maxWidth: 80 }}>Actions</th>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      style={{ width: colWidths[col.key] || 120, minWidth: colWidths[col.key] || 120, maxWidth: colWidths[col.key] || 120 }}
                      className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850 relative group/header"
                    >
                      {col.headerLetter}
                      <span className="block text-[10px] uppercase font-sans text-slate-400 dark:text-slate-500 font-bold tracking-wider mt-0.5 truncate">
                        {col.label}
                      </span>
                      {/* Resize Handle */}
                      <div
                        onMouseDown={e => handleResizeStart(col.key, e)}
                        className="absolute top-0 right-0 bottom-0 w-1 hover:w-1.5 hover:bg-emerald-500 dark:hover:bg-emerald-400 cursor-col-resize active:bg-emerald-600 z-30 transition-all select-none"
                      />
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRows.map((row, rowIdx) => {
                  const isSavingRow = !!savingRows[row._id];
                  return (
                    <tr
                      key={row._id}
                      className={`bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition group ${
                        isSavingRow ? "bg-emerald-500/5 dark:bg-emerald-950/10" : ""
                      }`}
                    >
                      {/* Left Number */}
                      <td className="w-12 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-center text-slate-450 dark:text-slate-550 select-none font-bold py-1.5 sticky left-0 z-10" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                        {rowIdx + 1}
                      </td>

                      {/* Selection Checkbox */}
                      <td className="w-12 border-r border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40 text-center py-1" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                        <input
                          type="checkbox"
                          checked={!!selectedIds[row._id]}
                          onChange={e => {
                            setSelectedIds(prev => ({
                              ...prev,
                              [row._id]: e.target.checked
                            }));
                          }}
                          className="h-4 w-4 rounded border-slate-350 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                        />
                      </td>

                      {/* Row Actions (Details & Delete) */}
                      <td className="w-20 border-r border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40 text-center py-1" style={{ width: 80, minWidth: 80, maxWidth: 80 }}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setDrawerPartyId(row._id)}
                            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-500 hover:text-emerald-400 transition"
                            title="Edit address and contacts details"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(row._id)}
                            disabled={isDeleting}
                            className="p-1 rounded hover:bg-rose-500/20 text-rose-500 hover:text-rose-455 transition"
                            title="Delete row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Spreadsheet Columns */}
                      {COLUMNS.map(col => {
                        const cellVal = row[col.key];
                        const isSelected = selectedCell?.partyId === row._id && selectedCell?.colKey === col.key;
                        const isReadonly = col.readonly;

                        return (
                          <td
                            key={col.key}
                            onClick={() => setSelectedCell({ partyId: row._id, colKey: col.key })}
                            style={{ width: colWidths[col.key] || 120, minWidth: colWidths[col.key] || 120, maxWidth: colWidths[col.key] || 120 }}
                            className={`border-r border-slate-200 dark:border-slate-800 p-0 text-slate-800 dark:text-slate-200 transition duration-75 relative ${
                              isReadonly ? "bg-slate-50/50 dark:bg-slate-900/30 text-slate-400 dark:text-slate-500 font-mono text-[10px]" : "cursor-cell hover:bg-slate-100/50 dark:hover:bg-slate-850/50"
                            } ${
                              isSelected ? "ring-2 ring-emerald-500 ring-inset bg-emerald-50/5 dark:bg-slate-850/90 z-10" : ""
                            }`}
                          >
                            {/* Readonly View */}
                            {isReadonly ? (
                              <div className="px-3 py-2 truncate max-w-[200px]" title={String(cellVal || "")}>
                                {cellVal ? String(cellVal) : "—"}
                              </div>
                            ) : (
                              /* Editable Cells */
                              <div className="w-full h-full flex items-center justify-between">
                                {col.type === "boolean" ? (
                                  <div className="w-full flex justify-center py-2">
                                    <input
                                      type="checkbox"
                                      checked={!!cellVal}
                                      onChange={e => {
                                        const nextVal = e.target.checked;
                                        setLocalRows(prev =>
                                          prev.map(r => r._id === row._id ? { ...r, [col.key]: nextVal } : r)
                                        );
                                        saveCell(row._id, col.key, nextVal);
                                      }}
                                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer"
                                    />
                                  </div>
                                ) : col.type === "date" ? (
                                  <input
                                    type="date"
                                    value={cellVal ? toDateString(cellVal) : ""}
                                    onChange={e => {
                                      const rawVal = e.target.value;
                                      setLocalRows(prev =>
                                        prev.map(r => r._id === row._id ? { ...r, [col.key]: rawVal } : r)
                                      );
                                    }}
                                    onBlur={e => saveCell(row._id, col.key, e.target.value || null)}
                                    className="w-full h-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-800 dark:text-slate-200"
                                  />
                                ) : col.type === "select" ? (
                                  <select
                                    value={String(cellVal || "customer")}
                                    onChange={e => {
                                      const newVal = e.target.value as any;
                                      setLocalRows(prev =>
                                        prev.map(r => r._id === row._id ? { ...r, party_type: newVal } : r)
                                      );
                                      saveCell(row._id, "party_type", newVal);
                                    }}
                                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-800 dark:text-slate-100 cursor-pointer capitalize"
                                  >
                                    {col.options?.map(opt => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={cellVal !== undefined && cellVal !== null ? String(cellVal) : ""}
                                    onChange={e => {
                                      const rawVal = e.target.value;
                                      setLocalRows(prev =>
                                        prev.map(r => r._id === row._id ? { ...r, [col.key]: rawVal } : r)
                                      );
                                    }}
                                    onBlur={e => saveCell(row._id, col.key, e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        saveCell(row._id, col.key, (e.target as HTMLInputElement).value);
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    className="w-full h-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-800 dark:text-slate-200"
                                  />
                                )}
                              </div>
                            )}

                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
                    {/* Side Drawer Details Panel overlay */}
          {drawerParty && (
            <>
              {/* Backdrop */}
              <div
                onClick={() => setDrawerPartyId(null)}
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-30 transition-opacity"
              />
              {/* Drawer Container */}
              <div className="absolute right-0 top-0 bottom-0 w-[500px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-40 flex flex-col transition-transform duration-300">
                {/* Header */}
                <div className="bg-slate-50 dark:bg-slate-850 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center select-none shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[360px]">
                      {drawerParty.party_name}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                      Configure Multiple Contacts & Addresses
                    </p>
                  </div>
                  <button
                    onClick={() => setDrawerPartyId(null)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Form fields content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 select-text">
                  {/* Billing Address Section */}
                  <div className="space-y-3.5 bg-slate-50/50 dark:bg-slate-850/30 border border-slate-200 dark:border-slate-850/50 rounded-xl p-4.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2">
                      🏠 Billing Address
                    </h4>
                    <div className="grid grid-cols-2 gap-3.5 text-[11px]">
                      <div className="col-span-2">
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Address Line 1</label>
                        <input
                          type="text"
                          defaultValue={drawerParty.billing_address?.address_line_1 || ""}
                          onBlur={e => saveAddress(drawerParty._id, "billing_address", "address_line_1", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. 123 Health Ave"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Address Line 2</label>
                        <input
                          type="text"
                          defaultValue={drawerParty.billing_address?.address_line_2 || ""}
                          onBlur={e => saveAddress(drawerParty._id, "billing_address", "address_line_2", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. Suite 400"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">City</label>
                        <input
                          type="text"
                          defaultValue={drawerParty.billing_address?.city || ""}
                          onBlur={e => saveAddress(drawerParty._id, "billing_address", "city", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. Kolkata"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">State</label>
                        <input
                          type="text"
                          defaultValue={drawerParty.billing_address?.state || ""}
                          onBlur={e => saveAddress(drawerParty._id, "billing_address", "state", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. West Bengal"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Pincode</label>
                        <input
                          type="text"
                          defaultValue={drawerParty.billing_address?.pincode || ""}
                          onBlur={e => saveAddress(drawerParty._id, "billing_address", "pincode", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition font-mono"
                          placeholder="700001"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Country</label>
                        <input
                          type="text"
                          defaultValue={drawerParty.billing_address?.country || "India"}
                          onBlur={e => saveAddress(drawerParty._id, "billing_address", "country", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Shipping Address Section */}
                  <div className="space-y-3.5 bg-slate-50/50 dark:bg-slate-850/30 border border-slate-200 dark:border-slate-850/50 rounded-xl p-4.5">
                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        🚚 Shipping Address
                      </h4>
                      <button
                        onClick={() => handleCopyBillingToShipping(drawerParty._id)}
                        className="text-[10px] text-emerald-500 dark:text-emerald-400 hover:text-emerald-650 dark:hover:text-emerald-300 font-semibold transition"
                      >
                        Copy from Billing
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3.5 text-[11px]">
                      <div className="col-span-2">
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Address Line 1</label>
                        <input
                          type="text"
                          key={`ship-1-${drawerParty.shipping_address?.address_line_1 || ""}`}
                          defaultValue={drawerParty.shipping_address?.address_line_1 || ""}
                          onBlur={e => saveAddress(drawerParty._id, "shipping_address", "address_line_1", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. 123 Health Ave"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Address Line 2</label>
                        <input
                          type="text"
                          key={`ship-2-${drawerParty.shipping_address?.address_line_2 || ""}`}
                          defaultValue={drawerParty.shipping_address?.address_line_2 || ""}
                          onBlur={e => saveAddress(drawerParty._id, "shipping_address", "address_line_2", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. Suite 400"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">City</label>
                        <input
                          type="text"
                          key={`ship-city-${drawerParty.shipping_address?.city || ""}`}
                          defaultValue={drawerParty.shipping_address?.city || ""}
                          onBlur={e => saveAddress(drawerParty._id, "shipping_address", "city", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. Kolkata"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">State</label>
                        <input
                          type="text"
                          key={`ship-state-${drawerParty.shipping_address?.state || ""}`}
                          defaultValue={drawerParty.shipping_address?.state || ""}
                          onBlur={e => saveAddress(drawerParty._id, "shipping_address", "state", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                          placeholder="e.g. West Bengal"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Pincode</label>
                        <input
                          type="text"
                          key={`ship-pin-${drawerParty.shipping_address?.pincode || ""}`}
                          defaultValue={drawerParty.shipping_address?.pincode || ""}
                          onBlur={e => saveAddress(drawerParty._id, "shipping_address", "pincode", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition font-mono"
                          placeholder="700001"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Country</label>
                        <input
                          type="text"
                          key={`ship-country-${drawerParty.shipping_address?.country || "India"}`}
                          defaultValue={drawerParty.shipping_address?.country || "India"}
                          onBlur={e => saveAddress(drawerParty._id, "shipping_address", "country", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs transition"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Multiple Contacts Section */}
                  <div className="space-y-4 bg-slate-50/50 dark:bg-slate-850/30 border border-slate-200 dark:border-slate-850/50 rounded-xl p-4.5">
                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        📞 Contacts Directory
                      </h4>
                      <button
                        onClick={() => handleAddContact(drawerParty._id)}
                        className="text-[10px] text-emerald-500 dark:text-emerald-400 hover:text-emerald-650 dark:hover:text-emerald-300 font-semibold transition flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded"
                      >
                        <UserPlus className="h-3 w-3" />
                        <span>Add Contact</span>
                      </button>
                    </div>

                    <div className="space-y-4">
                      {(!drawerParty.contacts || drawerParty.contacts.length === 0) && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-4 select-none">
                          No contacts configured. Click Add Contact to set up the list.
                        </p>
                      )}

                      {drawerParty.contacts?.map((contact, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-850/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 relative space-y-3.5 group">
                          {/* Remove Contact Card */}
                          <button
                            onClick={() => handleDeleteContact(drawerParty._id, idx)}
                            className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-rose-500/10 text-rose-550 dark:text-rose-500 hover:text-rose-400 transition"
                            title="Remove contact card"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>

                          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 select-none">
                            CONTACT CARD #{idx + 1} {idx === 0 && <span className="text-emerald-500 font-bold ml-1.5">(PRIMARY)</span>}
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div className="col-span-2">
                              <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Contact Name</label>
                              <input
                                type="text"
                                value={contact.name || ""}
                                onChange={e => handleContactFieldChange(drawerParty._id, idx, "name", e.target.value)}
                                onBlur={() => saveContacts(drawerParty._id)}
                                className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs"
                                placeholder="Full Name"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Department</label>
                              <input
                                type="text"
                                value={contact.department || ""}
                                onChange={e => handleContactFieldChange(drawerParty._id, idx, "department", e.target.value)}
                                onBlur={() => saveContacts(drawerParty._id)}
                                className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs"
                                placeholder="e.g. Procurement"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Mobile Phone</label>
                              <input
                                type="text"
                                value={contact.phone || ""}
                                onChange={e => handleContactFieldChange(drawerParty._id, idx, "phone", e.target.value)}
                                onBlur={() => saveContacts(drawerParty._id)}
                                className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs font-mono"
                                placeholder="Mobile No"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Email Address</label>
                              <input
                                type="text"
                                value={contact.email || ""}
                                onChange={e => handleContactFieldChange(drawerParty._id, idx, "email", e.target.value)}
                                onBlur={() => saveContacts(drawerParty._id)}
                                className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs font-mono"
                                placeholder="mail@domain.com"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-600 dark:text-slate-400 mb-0.5">Alt Phone</label>
                              <input
                                type="text"
                                value={contact.alternate_phone || ""}
                                onChange={e => handleContactFieldChange(drawerParty._id, idx, "alternate_phone", e.target.value)}
                                onBlur={() => saveContacts(drawerParty._id)}
                                className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs font-mono"
                                placeholder="Alternate phone"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer status check */}
                <div className="bg-slate-50 dark:bg-slate-850 px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-550 dark:text-slate-500 shrink-0 select-none flex items-center gap-1.5 justify-end">
                  <Cloud className="h-3 w-3 text-slate-450 dark:text-slate-500" />
                  <span>Changes auto-save instantly on field blur.</span>
                </div>
              </div>
            </>
          )}

          {/* Grid Footer Bar */}
          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 shrink-0 flex items-center justify-between text-xs text-slate-550 dark:text-slate-400 select-none">
            <div>
              Total Parties: <span className="font-semibold text-slate-800 dark:text-slate-200">{localRows.length}</span>
              {searchQuery && (
                <span className="ml-3 text-slate-500">
                  (filtered to {filteredRows.length} matching rows)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>All updates sync live directly to MongoDB backend.</span>
            </div>
          </div>
        </div>
      ) : (
        /* Connect Real Google Sheet View */
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Link2 className="h-5 w-5 text-emerald-500" />
                <span>Link a Real Google Sheet URL</span>
              </h3>
              <p className="text-xs text-slate-650 dark:text-slate-400 max-w-2xl leading-relaxed">
                Paste your Google Sheet link here. We will parse it and embed it so you can edit it directly from this popup modal. Updates from the sheet will be synced back to the backend in real-time.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={realSheetUrl}
                  onChange={e => handleSaveRealSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
                />
                {realSheetUrl && (
                  <a
                    href={realSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-705 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Embedded Iframe */}
            {googleSheetEmbedUrl ? (
              <div className="border border-slate-200 dark:border-slate-850 rounded-xl overflow-hidden shadow-xl bg-white dark:bg-slate-900">
                <div className="bg-slate-100 dark:bg-slate-850 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Google Sheet Embedded View</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Iframe loading via Google Docs URL</span>
                </div>
                <iframe
                  src={googleSheetEmbedUrl}
                  className="w-full h-[450px] border-none bg-white"
                  title="Google Sheet Embedded View"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl py-12 px-4 text-center bg-white dark:bg-slate-900/30">
                <div className="text-slate-400 dark:text-slate-655 mb-3 text-3xl">📁</div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Google Sheet URL connected</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                  Paste your spreadsheet link above to enable the embedded preview panel in this tab.
                </p>
              </div>
            )}

            {/* Setup Instructions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-lg space-y-5">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <Info className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                <span>Webhooks Setup Guide (How to Sync Google Sheet {"->"} Backend)</span>
              </h3>

              <div className="space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-350">
                <div className="space-y-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">1. Sheet Columns Setup</span>
                  <p>
                    Set the headers in Row 1 of your spreadsheet exactly as follows (column order doesn't matter, but names must match):
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1.5 font-mono text-[10px]">
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Party ID</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Party Name*</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Party Type*</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Contact Person</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Mobile / Phone</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Email Address</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">GSTIN No</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Drug License No</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">District</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">State</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Payment Terms</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Active</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">SRA</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">SRA From Date</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">SRA To Date</div>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">
                    * Asterisks denote fields required by the database engine.
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">2. Google Apps Script Configuration</span>
                  <p>
                    Open your sheet, select <strong className="text-slate-800 dark:text-slate-200">Extensions &gt; Apps Script</strong>, clear the editor, and copy-paste the code snippet below:
                  </p>

                  {/* Copy Script Container */}
                  <div className="relative border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-950 font-mono text-[11px] leading-normal text-slate-700 dark:text-slate-300">
                    <div className="bg-slate-100 dark:bg-slate-850 px-4 py-2 flex justify-between items-center text-xs select-none">
                      <span className="font-semibold text-slate-550 dark:text-slate-450">GoogleAppsScriptCode.js</span>
                      <button
                        onClick={copyScriptCode}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-250 border border-slate-200 dark:border-slate-700 transition active:scale-95"
                      >
                        {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedScript ? "Copied!" : "Copy Code"}</span>
                      </button>
                    </div>
                    <pre className="p-4 overflow-x-auto max-h-60 select-all border-t border-slate-200 dark:border-slate-800">
                      {`function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  
  if (row === 1) return; // skip header
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var payload = {};
  for (var i = 0; i < headers.length; i++) {
    var rawHeader = headers[i].toString().trim().toLowerCase();
    var key = rawHeader.replace(/\\*/g, "").replace(/[^a-z0-9_]/g, "_").replace(/__+/g, "_").trim();
    
    if (key === "party_id" || key === "id") key = "_id";
    if (key === "party_name" || key === "name") key = "party_name";
    if (key === "party_type" || key === "type") key = "party_type";
    if (key === "contact_person" || key === "contact") key = "contact_person";
    if (key === "mobile" || key === "phone") key = "mobile";
    if (key === "gstin" || key === "gstin_no") key = "gst_no";
    if (key === "active") key = "is_active";
    if (key === "sra_start" || key === "sra_start_date") key = "sra_from_date";
    if (key === "sra_end" || key === "sra_end_date") key = "sra_to_date";
    
    payload[key] = rowData[i];
  }
  
  var backendUrl = "${typeof window !== "undefined" ? window.location.origin : "http://localhost:5000"}/api/parties/google-sheet-webhook?secret=medica-gsheet-sync-secret";
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(backendUrl, options);
    if (response.getResponseCode() === 200 || response.getResponseCode() === 201) {
      var resData = JSON.parse(response.getContentText());
      if (resData.success && resData.data && resData.data._id && !rowData[0]) {
        sheet.getRange(row, 1).setValue(resData.data._id);
      }
    }
  } catch (err) {
    Logger.log(err.toString());
  }
}`}
                    </pre>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">3. Setup onEdit Trigger</span>
                  <p>
                    Inside the Google Apps Script panel, click on the Clock icon (<strong className="text-slate-800 dark:text-slate-200">Triggers</strong>) in the left sidebar. Add a trigger:
                  </p>
                  <ul className="list-disc list-inside pl-2 space-y-1 text-slate-500 dark:text-slate-400">
                    <li>Choose function: <code className="font-mono text-emerald-600 dark:text-emerald-400">onEdit</code></li>
                    <li>Choose deployment: <code className="font-mono">Head</code></li>
                    <li>Event source: <code className="font-mono text-emerald-600 dark:text-emerald-400">From spreadsheet</code></li>
                    <li>Event type: <code className="font-mono text-emerald-600 dark:text-emerald-400">On edit</code></li>
                  </ul>
                  <p className="mt-1">
                    Save the trigger and authorize the Google Script. Now, updates/new lines created in your Google Sheet will sync live to your OPMS database!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
