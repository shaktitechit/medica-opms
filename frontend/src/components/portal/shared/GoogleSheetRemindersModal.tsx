"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Cloud,
  Plus,
  Trash2,
  Search,
  Download,
  Info,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import {
  useListRemindersQuery,
  usePatchReminderMutation,
  useCreateReminderMutation,
  useDeleteReminderMutation,
  useAddFollowUpMutation,
  usePatchPartyMutation,
  type ReminderRecord,
} from "@/store/api";
import { useParams, useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

export type PartyContact = {
  name: string;
  department?: string;
  phone?: string;
  email?: string;
  alternate_phone?: string;
};

export type GoogleSheetRemindersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type SelectedCell = {
  reminderId: string;
  colKey: string;
} | null;

const COLUMNS: {
  key: string;
  label: string;
  headerLetter: string;
  readonly?: boolean;
  type?: "text" | "number" | "select" | "boolean";
  options?: string[];
}[] = [
    { key: "order", label: "Order Number*", headerLetter: "A", type: "text", readonly: true },
    { key: "order_date", label: "Order Date", headerLetter: "B", type: "text", readonly: true },
    { key: "party", label: "Party Name", headerLetter: "C", type: "text", readonly: true },
    { key: "contact_person", label: "Contact Person", headerLetter: "D", type: "text", readonly: true },
    { key: "contact_phone", label: "Contact Number", headerLetter: "E", type: "text", readonly: true },
    { key: "reminder_type", label: "Reminder Type*", headerLetter: "F", type: "select", options: ["payment", "remarks", "follow_up", "other"] },
    { key: "status", label: "Status*", headerLetter: "G", type: "select", options: ["active", "completed", "dismissed"] },
    { key: "next_followup_date", label: "Next Follow-up Date*", headerLetter: "H", type: "text" },
    { key: "remarks", label: "Follow-up Remarks*", headerLetter: "I", type: "text" },
    { key: "view_order", label: "View Order", headerLetter: "J", readonly: true }
  ];

const getReminderTypeStyle = (type: string) => {
  switch (type) {
    case "payment":
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 border border-emerald-200 dark:border-emerald-800";
    case "remarks":
      return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800";
    case "follow_up":
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800";
    default:
      return "bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-700";
  }
};

const getStatusStyle = (status: string) => {
  switch (status) {
    case "active":
      return "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800";
    case "completed":
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800";
    case "dismissed":
      return "bg-rose-50 dark:bg-rose-955/20 text-rose-700 dark:text-rose-455 border border-rose-200 dark:border-rose-800";
    default:
      return "bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-700";
  }
};

export function GoogleSheetRemindersModal({
  isOpen,
  onClose,
  onSuccess
}: GoogleSheetRemindersModalProps) {
  const params = useParams();
  const router = useRouter();
  const portal = params?.portal || "finance";

  const [activeTab, setActiveTab] = useState<"virtual" | "real">("virtual");
  const [activeSheetTab, setActiveSheetTab] = useState<"todays" | "all" | "payment" | "remarks" | "follow_up" | "other">("todays");
  const [mounted, setMounted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [formulaValue, setFormulaValue] = useState("");
  const [localRows, setLocalRows] = useState<any[]>([]);
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [realSheetUrl, setRealSheetUrl] = useState("");
  const [copiedScript, setCopiedScript] = useState(false);

  // Side drawer for detailed timeline / remarks history
  const [drawerReminderId, setDrawerReminderId] = useState<string | null>(null);
  const [drawerFollowUpRemarks, setDrawerFollowUpRemarks] = useState("");
  const [drawerFollowUpDate, setDrawerFollowUpDate] = useState("");
  const [drawerFollowUpStatus, setDrawerFollowUpStatus] = useState<"pending" | "completed" | "cancelled">("pending");

  // Dropdown filter states
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterPartyName, setFilterPartyName] = useState("");
  const [filterReminderType, setFilterReminderType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const uniqueParties = useMemo(() => {
    const list = localRows.map(r => r.party).filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [localRows]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterPartyName !== "" ||
      filterReminderType !== "all" ||
      filterStatus !== "all" ||
      filterStartDate !== "" ||
      filterEndDate !== ""
    );
  }, [filterPartyName, filterReminderType, filterStatus, filterStartDate, filterEndDate]);

  const handleClearFilters = () => {
    setFilterPartyName("");
    setFilterReminderType("all");
    setFilterStatus("all");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  // Resizable columns width state
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    order: 140,
    order_date: 130,
    party: 150,
    contact_person: 140,
    contact_phone: 130,
    reminder_type: 130,
    status: 120,
    next_followup_date: 180,
    remarks: 280,
    view_order: 120,
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
    return 48 + 80 + columnsSum; // 48px row numbers, 80px actions column
  }, [colWidths]);

  // RTK Queries & Mutations
  const { data, isLoading, isError, refetch } = useListRemindersQuery(
    {},
    { skip: !isOpen }
  );

  const [patchReminder] = usePatchReminderMutation();
  const [createReminder, { isLoading: isCreating }] = useCreateReminderMutation();
  const [deleteReminder, { isLoading: isDeleting }] = useDeleteReminderMutation();
  const [addFollowUp] = useAddFollowUpMutation();
  const [patchParty] = usePatchPartyMutation();

  const fetchedReminders = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (data as any).data || [];
  }, [data]);

  const drawerReminder = useMemo(() => {
    return localRows.find((r: any) => r._id === drawerReminderId) || null;
  }, [drawerReminderId, localRows]);

  const formatDateTime = (v: unknown): string => {
    if (!v) return "—";
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const handleAddFollowUpFromDrawer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerReminderId) return;
    if (!drawerFollowUpRemarks.trim() || !drawerFollowUpDate) {
      toast.error("Please fill in all required fields.");
      return;
    }

    try {
      await addFollowUp({
        id: drawerReminderId,
        remarks: drawerFollowUpRemarks.trim(),
        followup_date: new Date(drawerFollowUpDate).toISOString(),
        status: drawerFollowUpStatus,
      }).unwrap();

      toast.success("Follow-up logged successfully.");
      setDrawerFollowUpRemarks("");
      setDrawerFollowUpDate("");
      setDrawerFollowUpStatus("pending");
      refetch();
    } catch (err: any) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  // Load backend reminders into local state when queried
  useEffect(() => {
    if (fetchedReminders.length > 0) {
      // Map reminders to match grid inputs
      const mapped = fetchedReminders.map((r: any) => {
        const orderNo = r.order && typeof r.order === "object" ? r.order.order_no : String(r.order || "");
        const rawOrderDate = r.order && typeof r.order === "object" ? r.order.order_date : null;
        const formattedOrderDate = rawOrderDate ? new Date(rawOrderDate).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
        const partyName = r.party && typeof r.party === "object" ? r.party.party_name : String(r.party || "—");

        // Contact details from Party
        let contactPerson = "—";
        let contactPhone = "—";
        if (r.party && typeof r.party === "object") {
          contactPerson = r.party.contact_person || "—";
          contactPhone = r.party.mobile || "—";
          // If no main contact/mobile, check contacts array
          if ((!contactPerson || contactPerson === "—") && r.party.contacts?.length > 0) {
            const firstContact = r.party.contacts[0];
            contactPerson = firstContact.name || "—";
            contactPhone = firstContact.phone || "—";
          }
        }

        const lastFollowUp = r.follow_ups && r.follow_ups[r.follow_ups.length - 1];
        return {
          _id: r._id || r.id,
          order: orderNo,
          orderObj: r.order,
          order_date: formattedOrderDate,
          party: partyName,
          partyObj: r.party,
          contact_person: contactPerson,
          contact_phone: contactPhone,
          reminder_type: r.reminder_type || "follow_up",
          status: r.status || "active",
          next_followup_date: r.next_followup_date || "",
          remarks: lastFollowUp ? lastFollowUp.remarks : "",
          follow_ups: r.follow_ups || [],
        };
      });
      setLocalRows(mapped);
    }
  }, [fetchedReminders]);

  // Load real sheet URL from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("medica_linked_google_sheet_reminders_url") || "";
      setRealSheetUrl(saved);
    }
  }, []);

  const handleSaveRealSheetUrl = (url: string) => {
    setRealSheetUrl(url);
    if (typeof window !== "undefined") {
      localStorage.setItem("medica_linked_google_sheet_reminders_url", url);
    }
    toast.success("Google Sheet URL updated!");
  };

  // Sync formula bar input back to selected cell
  useEffect(() => {
    if (selectedCell) {
      const row = localRows.find(r => r._id === selectedCell.reminderId);
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
      if (e.key === "Escape") {
        if (drawerReminderId) {
          setDrawerReminderId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen, onClose, drawerReminderId]);

  // Helper to extract sheet ID for embedding
  const googleSheetEmbedUrl = useMemo(() => {
    if (!realSheetUrl) return null;
    const match = realSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/htmlembed?widget=true&headers=false`;
    }
    return null;
  }, [realSheetUrl]);

  // Handle cell edit save to server
  const saveCell = useCallback(async (reminderId: string, colKey: string, val: any) => {
    const originalReminder = fetchedReminders.find((r: any) => (r._id || r.id) === reminderId);
    if (!originalReminder) return;

    if (colKey === "order_date" || colKey === "party" || colKey === "contact_person" || colKey === "contact_phone" || colKey === "view_order") {
      return;
    }

    let originalVal;
    if (colKey === "remarks") {
      const lastFollowUp = originalReminder.follow_ups && originalReminder.follow_ups[originalReminder.follow_ups.length - 1];
      originalVal = lastFollowUp ? lastFollowUp.remarks : "";
    } else if (colKey === "order") {
      originalVal = originalReminder.order && typeof originalReminder.order === "object"
        ? originalReminder.order.order_no
        : String(originalReminder.order || "");
    } else {
      originalVal = originalReminder[colKey as keyof ReminderRecord];
    }

    // Don't patch if value didn't change
    if (originalVal === val) return;

    setSavingRows(prev => ({ ...prev, [reminderId]: true }));
    try {
      if (colKey === "remarks") {
        await addFollowUp({
          id: reminderId,
          remarks: val,
          followup_date: originalReminder.next_followup_date || new Date().toISOString(),
          status: originalReminder.status === "completed" ? "completed" : "pending"
        }).unwrap();
      } else {
        await patchReminder({
          id: reminderId,
          patch: { [colKey]: val }
        }).unwrap();
      }

      // Update local row state
      setLocalRows(prev =>
        prev.map(row => (row._id === reminderId ? { ...row, [colKey]: val } : row))
      );
    } catch (err: any) {
      toast.error(mutationRejectedMessage(err));
      refetch();
    } finally {
      setSavingRows(prev => ({ ...prev, [reminderId]: false }));
    }
  }, [fetchedReminders, patchReminder, addFollowUp, refetch]);

  // Delete a reminder row
  const handleDeleteRow = async (reminderId: string) => {
    if (!confirm("Are you sure you want to delete this reminder?")) return;
    try {
      await deleteReminder(reminderId).unwrap();
      toast.success("Reminder deleted successfully");
      refetch();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  // Update a specific contact field locally for all reminders referencing this party
  const handleContactFieldChange = (partyId: string, index: number, field: keyof PartyContact, val: string) => {
    setLocalRows(prev =>
      prev.map(r => {
        if (r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId)) {
          const currentContacts = [...(r.partyObj.contacts || [])];
          currentContacts[index] = { ...currentContacts[index], [field]: val };
          return {
            ...r,
            partyObj: { ...r.partyObj, contacts: currentContacts }
          };
        }
        return r;
      })
    );
  };

  // Save the full contacts array to backend on blur
  const saveContacts = async (partyId: string) => {
    const row = localRows.find(r => r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId));
    if (!row || !row.partyObj) return;

    const contactsList = row.partyObj.contacts || [];

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      const result: any = await patchParty({
        id: partyId,
        patch: { contacts: contactsList }
      }).unwrap();

      setLocalRows(prev =>
        prev.map(r => {
          if (r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId)) {
            let contactPerson = result.contact_person || "—";
            let contactPhone = result.mobile || "—";
            if ((!contactPerson || contactPerson === "—") && result.contacts?.length > 0) {
              const firstContact = result.contacts[0];
              contactPerson = firstContact.name || "—";
              contactPhone = firstContact.phone || "—";
            }
            return {
              ...r,
              contact_person: contactPerson,
              contact_phone: contactPhone,
              partyObj: result
            };
          }
          return r;
        })
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
    const row = localRows.find(r => r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId));
    if (!row || !row.partyObj) return;

    const currentContacts = [...(row.partyObj.contacts || [])];
    const newContact: PartyContact = { name: "New Contact", department: "", phone: "", email: "", alternate_phone: "" };
    const updatedContacts = [...currentContacts, newContact];

    setLocalRows(prev =>
      prev.map(r => {
        if (r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId)) {
          return {
            ...r,
            partyObj: { ...r.partyObj, contacts: updatedContacts }
          };
        }
        return r;
      })
    );

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      const result: any = await patchParty({
        id: partyId,
        patch: { contacts: updatedContacts }
      }).unwrap();

      setLocalRows(prev =>
        prev.map(r => {
          if (r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId)) {
            let contactPerson = result.contact_person || "—";
            let contactPhone = result.mobile || "—";
            if ((!contactPerson || contactPerson === "—") && result.contacts?.length > 0) {
              const firstContact = result.contacts[0];
              contactPerson = firstContact.name || "—";
              contactPhone = firstContact.phone || "—";
            }
            return {
              ...r,
              contact_person: contactPerson,
              contact_phone: contactPhone,
              partyObj: result
            };
          }
          return r;
        })
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
    const row = localRows.find(r => r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId));
    if (!row || !row.partyObj) return;

    const currentContacts = [...(row.partyObj.contacts || [])];
    const updatedContacts = currentContacts.filter((_, i) => i !== index);

    setLocalRows(prev =>
      prev.map(r => {
        if (r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId)) {
          return {
            ...r,
            partyObj: { ...r.partyObj, contacts: updatedContacts }
          };
        }
        return r;
      })
    );

    setSavingRows(prev => ({ ...prev, [partyId]: true }));
    try {
      const result: any = await patchParty({
        id: partyId,
        patch: { contacts: updatedContacts }
      }).unwrap();

      setLocalRows(prev =>
        prev.map(r => {
          if (r.partyObj && (r.partyObj._id === partyId || r.partyObj.id === partyId)) {
            let contactPerson = result.contact_person || "—";
            let contactPhone = result.mobile || "—";
            if ((!contactPerson || contactPerson === "—") && result.contacts?.length > 0) {
              const firstContact = result.contacts[0];
              contactPerson = firstContact.name || "—";
              contactPhone = firstContact.phone || "—";
            }
            return {
              ...r,
              contact_person: contactPerson,
              contact_phone: contactPhone,
              partyObj: result
            };
          }
          return r;
        })
      );
      toast.success("Contact card removed!");
    } catch (err) {
      toast.error("Failed to delete contact");
      refetch();
    } finally {
      setSavingRows(prev => ({ ...prev, [partyId]: false }));
    }
  };

  // Filtered rows for virtual sheet search and dropdown filters
  const filteredRows = useMemo(() => {
    let rows = localRows;

    // 1. Bottom Sheet Tab category
    if (activeSheetTab === "todays") {
      const isTodayOrPast = (dateStr?: string) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const today = new Date();
        const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return dDate.getTime() <= todayDate.getTime();
      };
      rows = rows.filter(r => r.status === "active" && isTodayOrPast(r.next_followup_date));
    } else if (activeSheetTab !== "all") {
      rows = rows.filter(r => r.reminder_type === activeSheetTab);
    }

    // 2. Party Name filter
    if (filterPartyName) {
      rows = rows.filter(r => r.party === filterPartyName);
    }

    // 3. Reminder Type filter
    if (filterReminderType !== "all") {
      rows = rows.filter(r => r.reminder_type === filterReminderType);
    }

    // 4. Status filter
    if (filterStatus !== "all") {
      rows = rows.filter(r => r.status === filterStatus);
    }

    // 5. Follow-up Date Range filter
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      rows = rows.filter(r => {
        if (!r.next_followup_date) return false;
        const d = new Date(r.next_followup_date);
        const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return dDate.getTime() >= start.getTime();
      });
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      rows = rows.filter(r => {
        if (!r.next_followup_date) return false;
        const d = new Date(r.next_followup_date);
        const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return dDate.getTime() <= end.getTime();
      });
    }

    // 6. Text Search Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        r =>
          r.order?.toLowerCase().includes(query) ||
          r.order_date?.toLowerCase().includes(query) ||
          r.party?.toLowerCase().includes(query) ||
          r.contact_person?.toLowerCase().includes(query) ||
          r.contact_phone?.toLowerCase().includes(query) ||
          r.reminder_type?.toLowerCase().includes(query) ||
          r.status?.toLowerCase().includes(query) ||
          r.next_followup_date?.toLowerCase().includes(query) ||
          r.remarks?.toLowerCase().includes(query)
      );
    }

    return rows;
  }, [
    localRows,
    searchQuery,
    activeSheetTab,
    filterPartyName,
    filterReminderType,
    filterStatus,
    filterStartDate,
    filterEndDate
  ]);

  // Copy apps script code
  const copyScriptCode = () => {
    const code = `/**
 * Google Sheets App Script for OPMS Reminders Live-Sync
 * Paste this inside Extensions -> Apps Script in your Google Sheet.
 */

// Configuration
var BACKEND_WEBHOOK_URL = "${typeof window !== "undefined" ? window.location.origin : "http://localhost:5000"}/api/reminders/google-sheet-webhook?secret=medica-gsheet-sync-secret";

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
    if (key === "reminder_id" || key === "id") key = "_id";
    if (key === "order_number" || key === "order" || key === "order_no") key = "order_no";
    if (key === "reminder_type" || key === "type") key = "reminder_type";
    if (key === "next_followup_date" || key === "followup_date" || key === "date") key = "next_followup_date";
    
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
        // Automatically write back the new MongoDB _id to Column A (Reminder ID)
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
    const headers = ["Reminder ID", ...COLUMNS.map(c => c.label)].join(",");
    const csvRows = localRows.map(row => {
      return [
        `"${row._id}"`,
        ...COLUMNS.map(col => {
          const val = row[col.key];
          const stringified = val !== undefined && val !== null ? String(val) : "";
          return `"${stringified.replace(/"/g, '""')}"`;
        })
      ].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `medica_reminders_sync_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!mounted || !isOpen) return null;

  const isSavingAny = Object.values(savingRows).some(Boolean);

  return createPortal(
    <div className="fixed inset-0 w-screen h-screen z-[100] flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans" role="dialog" aria-modal="true">
      {/* Top Main Google Sheets-Style Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-650 text-white font-semibold text-lg shadow shadow-emerald-500/20">
            ⏳
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100">
                Reminders Master Spreadsheet
              </span>
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
          {activeTab === "real" && realSheetUrl && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${showSettings
                  ? "bg-slate-200 border-slate-300 text-slate-900 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                  : "border-slate-200 text-slate-500 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              title="Toggle configuration settings"
            >
              ⚙️ Settings
            </button>
          )}
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
            title="Exit spreadsheet"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      {activeTab === "virtual" ? (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-955 relative">
          {/* Sheets Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Filter Search & Dropdown popover */}
            <div className="flex items-center gap-2 relative">
              <div className="relative w-60">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 pointer-events-none">
                  <Search className="h-3.5 w-3.5" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search reminders..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {/* Filters Toggle Button */}
              <button
                onClick={() => setIsFilterPanelOpen(prev => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition relative ${isFilterPanelOpen || hasActiveFilters
                    ? "border-emerald-500 bg-emerald-50/10 text-emerald-600 dark:text-emerald-450"
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
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 px-1 py-1.5 transition cursor-pointer"
                  title="Clear all active filters"
                >
                  Clear
                </button>
              )}

              {/* Filter Panel Dropdown Popover */}
              {isFilterPanelOpen && (
                <>
                  <div
                    className="fixed inset-0 z-45"
                    onClick={() => setIsFilterPanelOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-80 max-h-[75vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-4 z-50 space-y-4 text-xs select-none scrollbar-thin">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 font-sans">
                      <span className="font-bold text-slate-900 dark:text-slate-100">Sheet Filters</span>
                      <button
                        onClick={handleClearFilters}
                        disabled={!hasActiveFilters}
                        className="text-[10px] text-slate-400 hover:text-emerald-500 disabled:opacity-50 transition font-semibold cursor-pointer"
                      >
                        Reset All
                      </button>
                    </div>

                    {/* Filter Fields */}
                    <div className="space-y-3 font-sans">
                      {/* Party Name Select */}
                      <div>
                        <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Party Name</label>
                        <select
                          value={filterPartyName}
                          onChange={e => setFilterPartyName(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="">All Parties</option>
                          {uniqueParties.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      {/* Reminder Type Select */}
                      <div>
                        <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Reminder Type</label>
                        <select
                          value={filterReminderType}
                          onChange={e => setFilterReminderType(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All Types</option>
                          <option value="payment">💰 Payment</option>
                          <option value="remarks">📝 Remarks</option>
                          <option value="follow_up">⏳ Follow-up</option>
                          <option value="other">📌 Other</option>
                        </select>
                      </div>

                      {/* Status Select */}
                      <div>
                        <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Status</label>
                        <select
                          value={filterStatus}
                          onChange={e => setFilterStatus(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All Statuses</option>
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                          <option value="dismissed">Dismissed</option>
                        </select>
                      </div>

                      {/* Date range filter */}
                      <div>
                        <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Follow-up Date Range</label>
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">From</span>
                            <input
                              type="date"
                              value={filterStartDate}
                              onChange={e => setFilterStartDate(e.target.value)}
                              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">To</span>
                            <input
                              type="date"
                              value={filterEndDate}
                              onChange={e => setFilterEndDate(e.target.value)}
                              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Formula Bar */}
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs shrink-0 select-none">
            <span className="font-bold text-slate-400 dark:text-slate-500 pr-3 border-r border-slate-200 dark:border-slate-800 font-mono">fx</span>
            <input
              type="text"
              value={formulaValue}
              onChange={e => {
                setFormulaValue(e.target.value);
                if (selectedCell) {
                  setLocalRows(prev =>
                    prev.map(r => r._id === selectedCell.reminderId ? { ...r, [selectedCell.colKey]: e.target.value } : r)
                  );
                }
              }}
              onBlur={() => {
                if (selectedCell) {
                  saveCell(selectedCell.reminderId, selectedCell.colKey, formulaValue);
                }
              }}
              disabled={!selectedCell || COLUMNS.find(c => c.key === selectedCell.colKey)?.readonly}
              placeholder={selectedCell ? (COLUMNS.find(c => c.key === selectedCell.colKey)?.readonly ? "Read-only cell" : "Enter value or text...") : "Select a cell to edit its value"}
              className="flex-1 bg-transparent px-3 outline-none text-slate-800 dark:text-slate-100 disabled:text-slate-400"
            />
          </div>

          {/* Virtual Grid Table */}
          <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 relative">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-950/50">
                <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            ) : null}

            <table className="border-collapse table-fixed select-none" style={{ width: `${totalWidth}px` }}>
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-20 text-slate-550 dark:text-slate-400 font-semibold font-mono">
                <tr>
                  {/* Empty Corner */}
                  <th className="w-12 sticky left-0 top-0 z-30 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 text-[10px] text-slate-400 text-center font-normal"></th>
                  {/* Actions Column Header */}
                  <th className="w-20 border-r border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 text-center bg-slate-100 dark:bg-slate-850">Actions</th>
                  {/* Mapped columns */}
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      style={{ width: `${colWidths[col.key]}px` }}
                      className="relative border-r border-slate-200 dark:border-slate-800 text-left px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-355 dark:text-slate-350 bg-slate-100 dark:bg-slate-850"
                    >
                      <div className="flex justify-between items-center">
                        <span className="truncate">{col.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono font-normal pl-2">{col.headerLetter}</span>
                      </div>
                      {/* Resize Handle */}
                      <div
                        onMouseDown={e => handleResizeStart(col.key, e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 z-30"
                      />
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row, index) => {
                  const isReminderActive = row.status === "active";
                  const isPastDue = (dateStr?: string): boolean => {
                    if (!dateStr || !isReminderActive) return false;
                    return new Date(dateStr).getTime() < Date.now();
                  };
                  const dueAlert = isPastDue(row.next_followup_date);

                  return (
                    <tr
                      key={row._id}
                      className={`border-b border-slate-150 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${dueAlert
                          ? "bg-rose-50/15 hover:bg-rose-50/25 dark:bg-rose-955/5 dark:hover:bg-rose-955/10"
                          : "bg-white dark:bg-slate-900/60"
                        }`}
                    >
                      {/* Row Number Column */}
                      <td className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-850 border-r border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-400 text-center select-none font-normal">
                        {index + 2}
                      </td>

                      {/* Delete actions */}
                      <td className="border-r border-slate-150 dark:border-slate-800 p-1 flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setDrawerReminderId(row._id)}
                          className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-955/20 transition cursor-pointer"
                          title="View Timeline / Log Follow-up"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(row._id)}
                          disabled={isDeleting}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-955/20 transition cursor-pointer"
                          title="Delete Reminder Row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>

                      {/* Interactive cells */}
                      {COLUMNS.map(col => {
                        if (col.key === "view_order") {
                          const orderId = row.orderObj && typeof row.orderObj === "object" ? (row.orderObj._id || row.orderObj.id) : null;
                          return (
                            <td
                              key={col.key}
                              className="border-r border-slate-150 dark:border-slate-800 text-xs px-3 py-1.5 overflow-hidden truncate text-center bg-slate-50/50 dark:bg-slate-900/30"
                            >
                              {orderId ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/${portal}/order/${orderId}`);
                                    onClose();
                                  }}
                                  type="button"
                                  className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-bold transition cursor-pointer hover:underline"
                                >
                                  <span>View Order ↗</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">—</span>
                              )}
                            </td>
                          );
                        }

                        const val = row[col.key];
                        const isSelected = selectedCell?.reminderId === row._id && selectedCell?.colKey === col.key;

                        return (
                          <td
                            key={col.key}
                            onClick={() => setSelectedCell({ reminderId: row._id, colKey: col.key })}
                            className={`border-r border-slate-150 dark:border-slate-800 text-xs px-3 py-1.5 overflow-hidden truncate focus-within:ring-2 focus-within:ring-emerald-500 ${isSelected
                                ? "bg-emerald-50/15 ring-2 ring-emerald-500 ring-inset dark:ring-emerald-500/80 z-10"
                                : ""
                              }`}
                          >
                            {col.readonly ? (
                              <span className="text-slate-400 dark:text-slate-500 font-mono select-all select-text">{val}</span>
                            ) : col.type === "select" ? (
                              isSelected ? (
                                <select
                                  value={val || ""}
                                  onChange={e => {
                                    saveCell(row._id, col.key, e.target.value);
                                    setSelectedCell(null);
                                  }}
                                  onBlur={() => setSelectedCell(null)}
                                  autoFocus
                                  className="w-full bg-transparent outline-none border-none cursor-pointer"
                                >
                                  <option value="" disabled>Select...</option>
                                  {col.options?.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${col.key === "reminder_type"
                                    ? getReminderTypeStyle(val)
                                    : getStatusStyle(val)
                                  }`}>
                                  {val}
                                </span>
                              )
                            ) : (
                              isSelected ? (
                                <input
                                  type="text"
                                  value={val !== undefined && val !== null ? String(val) : ""}
                                  onChange={e => {
                                    setLocalRows(prev =>
                                      prev.map(r => r._id === row._id ? { ...r, [col.key]: e.target.value } : r)
                                    );
                                  }}
                                  onBlur={e => saveCell(row._id, col.key, e.target.value)}
                                  autoFocus
                                  className="w-full bg-transparent border-none outline-none"
                                />
                              ) : (
                                <span className={
                                  col.key === "next_followup_date" && dueAlert
                                    ? "text-rose-600 font-bold dark:text-rose-455 flex items-center gap-1"
                                    : "text-slate-800 dark:text-slate-200"
                                }>
                                  {col.key === "next_followup_date" && dueAlert && <span>⚠️</span>}
                                  {val !== undefined && val !== null ? String(val) : ""}
                                </span>
                              )
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

          {/* Google Sheets Sheet Tabs Bottom Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 select-none text-xs">
            {/* Sheet Tabs */}
            <div className="flex items-center overflow-x-auto border-b sm:border-b-0 border-slate-200 dark:border-slate-800 scrollbar-none">
              {/* Sheet navigator mock buttons */}
              <div className="flex items-center px-3 py-1.5 border-r border-slate-200 dark:border-slate-800 text-slate-400 gap-1.5 font-mono">
                <span className="cursor-pointer hover:text-slate-655 dark:hover:text-slate-300">◀</span>
                <span className="cursor-pointer hover:text-slate-655 dark:hover:text-slate-300">▶</span>
              </div>

              {/* Tab list */}
              <div className="flex items-center h-full relative top-[1px]">
                {[
                  { id: "todays", label: "Today's Follow Up" },
                  { id: "all", label: "All Reminders" },
                  { id: "payment", label: "Payments" },
                  { id: "remarks", label: "Remarks" },
                  { id: "follow_up", label: "Follow Up" },
                  { id: "other", label: "Others" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSheetTab(tab.id as any)}
                    className={`px-4 py-2 border-r border-slate-200 dark:border-slate-800 font-semibold whitespace-nowrap cursor-pointer transition ${activeSheetTab === tab.id
                        ? "bg-white dark:bg-slate-900 text-emerald-650 dark:text-emerald-400 border-t-2 border-t-emerald-600 dark:border-t-emerald-450 border-b-transparent"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats / Rows Indicator */}
            <div className="flex items-center justify-between sm:justify-end gap-4 px-6 py-2.5 sm:py-0 text-slate-500 dark:text-slate-400 text-[11px] font-sans">
              <span className="hidden md:inline italic text-slate-400 dark:text-slate-500">Double click or select cell to update.</span>
              <span>Showing <strong>{filteredRows.length}</strong> / {localRows.length} reminders</span>
            </div>
          </div>

          {/* Side Drawer Details Panel overlay */}
          {drawerReminder && (
            <>
              {/* Backdrop */}
              <div
                onClick={() => setDrawerReminderId(null)}
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-30 transition-opacity"
              />
              {/* Drawer Container */}
              <div className="absolute right-0 top-0 bottom-0 w-[500px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-40 flex flex-col transition-transform duration-300">
                {/* Header */}
                <div className="bg-slate-50 dark:bg-slate-850 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center select-none shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[360px]">
                      Reminder Timeline & Log
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate max-w-[380px]">
                      Order: {drawerReminder.order && typeof drawerReminder.order === "object" ? drawerReminder.order.order_no : String(drawerReminder.order || "—")} | Party: {drawerReminder.party && typeof drawerReminder.party === "object" ? drawerReminder.party.party_name : String(drawerReminder.party || "—")}
                    </p>
                  </div>
                  <button
                    onClick={() => setDrawerReminderId(null)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Form fields & Timeline */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 select-text font-sans">

                  {/* Timeline section */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2">
                      💬 Remarks & Action Log ({drawerReminder.follow_ups?.length || 0})
                    </h4>
                    {(!drawerReminder.follow_ups || drawerReminder.follow_ups.length === 0) ? (
                      <p className="text-xs text-slate-400 italic">No notes recorded.</p>
                    ) : (
                      <div className="flow-root pl-1">
                        <ul className="-mb-8">
                          {drawerReminder.follow_ups.map((log: any, logIdx: number) => {
                            const logCreator = typeof log.created_by === "object" ? log.created_by : null;
                            const creatorName = logCreator?.name || "System";
                            const isFollowUpCompleted = log.status === "completed";

                            return (
                              <li key={log._id || log.id || logIdx}>
                                <div className="relative pb-6">
                                  {logIdx !== drawerReminder.follow_ups.length - 1 && (
                                    <span
                                      className="absolute top-4 left-3 -ml-px h-full w-0.5 bg-slate-100 dark:bg-white/5"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <div className="relative flex space-x-3">
                                    <div>
                                      <span
                                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ring-4 ring-white dark:ring-slate-900 ${isFollowUpCompleted
                                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                                            : "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-400"
                                          }`}
                                      >
                                        {isFollowUpCompleted ? "✓" : "⏰"}
                                      </span>
                                    </div>
                                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-0.5">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-800 dark:text-slate-200 break-words pr-2">
                                          {log.remarks}
                                        </p>
                                        {log.followup_date && (
                                          <span className="block mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 font-sans">
                                            Follow-up: {formatDateTime(log.followup_date)}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-right text-[10px] whitespace-nowrap text-slate-500 font-sans">
                                        <span className="font-semibold">{creatorName}</span>
                                        <span className="block mt-0.5 text-[9px]">
                                          {formatDateTime(log.createdAt)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Form section */}
                  <form onSubmit={handleAddFollowUpFromDrawer} className="space-y-4 bg-slate-50/50 dark:bg-slate-850/30 border border-slate-200 dark:border-slate-800 rounded-xl p-4.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2">
                      ✍️ Log Follow-up Remark
                    </h4>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Next Follow-up Date & Time</label>
                      <input
                        type="datetime-local"
                        required
                        value={drawerFollowUpDate}
                        onChange={(e) => setDrawerFollowUpDate(e.target.value)}
                        className="w-full mt-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 px-3 py-2 text-xs outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-350">Follow-up Remarks</label>
                      <textarea
                        required
                        rows={3}
                        value={drawerFollowUpRemarks}
                        onChange={(e) => setDrawerFollowUpRemarks(e.target.value)}
                        placeholder="Enter what was discussed, payment promises, or new details..."
                        className="w-full mt-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 px-3 py-2 text-xs outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-350">Status Outcome</label>
                      <select
                        value={drawerFollowUpStatus}
                        onChange={(e) => setDrawerFollowUpStatus(e.target.value as any)}
                        className="w-full mt-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 px-3 py-2 text-xs outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20"
                      >
                        <option value="pending">⏳ Pending Next Follow-up</option>
                        <option value="completed">✓ Completed (Resolve Reminder)</option>
                        <option value="cancelled">✕ Cancelled</option>
                      </select>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow shadow-emerald-500/10 cursor-pointer transition active:scale-95"
                      >
                        Log Follow-up
                      </button>
                    </div>
                  </form>

                  {/* Multiple Contacts Section */}
                  {drawerReminder.partyObj && typeof drawerReminder.partyObj === "object" && (
                    <div className="space-y-4 bg-slate-50/50 dark:bg-slate-850/30 border border-slate-200 dark:border-slate-850/50 rounded-xl p-4.5">
                      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                          📞 Contacts Directory
                        </h4>
                        <button
                          onClick={() => handleAddContact(drawerReminder.partyObj._id || drawerReminder.partyObj.id)}
                          type="button"
                          className="text-[10px] text-emerald-500 dark:text-emerald-400 hover:text-emerald-650 dark:hover:text-emerald-300 font-semibold transition flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded cursor-pointer"
                        >
                          <UserPlus className="h-3 w-3" />
                          <span>Add Contact</span>
                        </button>
                      </div>

                      <div className="space-y-4">
                        {(!drawerReminder.partyObj.contacts || drawerReminder.partyObj.contacts.length === 0) && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-4 select-none">
                            No contacts configured. Click Add Contact to set up the list.
                          </p>
                        )}

                        {drawerReminder.partyObj.contacts?.map((contact: PartyContact, idx: number) => (
                          <div key={idx} className="bg-white dark:bg-slate-850/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 relative space-y-3.5 group">
                            {/* Remove Contact Card */}
                            <button
                              onClick={() => handleDeleteContact(drawerReminder.partyObj._id || drawerReminder.partyObj.id, idx)}
                              type="button"
                              className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-rose-500/10 text-rose-550 dark:text-rose-500 hover:text-rose-400 transition cursor-pointer"
                              title="Remove contact card"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>

                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 select-none font-sans">
                              CONTACT CARD #{idx + 1} {idx === 0 && <span className="text-emerald-500 font-bold ml-1.5">(PRIMARY)</span>}
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-[11px]">
                              <div className="col-span-2">
                                <label className="block text-slate-600 dark:text-slate-400 mb-0.5 font-medium">Contact Name</label>
                                <input
                                  type="text"
                                  value={contact.name || ""}
                                  onChange={e => handleContactFieldChange(drawerReminder.partyObj._id || drawerReminder.partyObj.id, idx, "name", e.target.value)}
                                  onBlur={() => saveContacts(drawerReminder.partyObj._id || drawerReminder.partyObj.id)}
                                  className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs"
                                  placeholder="Full Name"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-600 dark:text-slate-400 mb-0.5 font-medium">Department</label>
                                <input
                                  type="text"
                                  value={contact.department || ""}
                                  onChange={e => handleContactFieldChange(drawerReminder.partyObj._id || drawerReminder.partyObj.id, idx, "department", e.target.value)}
                                  onBlur={() => saveContacts(drawerReminder.partyObj._id || drawerReminder.partyObj.id)}
                                  className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs"
                                  placeholder="e.g. Procurement"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-600 dark:text-slate-400 mb-0.5 font-medium">Mobile Phone</label>
                                <input
                                  type="text"
                                  value={contact.phone || ""}
                                  onChange={e => handleContactFieldChange(drawerReminder.partyObj._id || drawerReminder.partyObj.id, idx, "phone", e.target.value)}
                                  onBlur={() => saveContacts(drawerReminder.partyObj._id || drawerReminder.partyObj.id)}
                                  className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs font-mono"
                                  placeholder="Mobile No"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-600 dark:text-slate-400 mb-0.5 font-medium">Email Address</label>
                                <input
                                  type="text"
                                  value={contact.email || ""}
                                  onChange={e => handleContactFieldChange(drawerReminder.partyObj._id || drawerReminder.partyObj.id, idx, "email", e.target.value)}
                                  onBlur={() => saveContacts(drawerReminder.partyObj._id || drawerReminder.partyObj.id)}
                                  className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs font-mono"
                                  placeholder="mail@domain.com"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-605 dark:text-slate-400 mb-0.5 font-medium">Alt Phone</label>
                                <input
                                  type="text"
                                  value={contact.alternate_phone || ""}
                                  onChange={e => handleContactFieldChange(drawerReminder.partyObj._id || drawerReminder.partyObj.id, idx, "alternate_phone", e.target.value)}
                                  onBlur={() => saveContacts(drawerReminder.partyObj._id || drawerReminder.partyObj.id)}
                                  className="w-full rounded border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-xs font-mono"
                                  placeholder="Alternate phone"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
          {(!realSheetUrl || showSettings) && (
            <div className="w-full bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6 overflow-y-auto max-h-[45vh] shrink-0">
              <div className="w-full max-w-[96%] mx-auto space-y-6">
                {/* Sheet Link Section */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-555 dark:text-slate-50 flex items-center gap-1.5">
                    Link Google Spreadsheet
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Input your Google Sheet URL here to enable app frame embedding and quick dashboard navigation.
                  </p>

                  <div className="mt-4 flex gap-3">
                    <input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit"
                      value={realSheetUrl}
                      onChange={e => setRealSheetUrl(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
                    />
                    <button
                      onClick={() => handleSaveRealSheetUrl(realSheetUrl)}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow shadow-emerald-500/10 cursor-pointer"
                    >
                      Save URL
                    </button>
                  </div>
                </div>

                {/* Script Snippet / Webhook Setup */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-555 dark:text-slate-50 flex items-center gap-1.5">
                        Live Sync Script Setup
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Paste this App Script in Extensions {"->"} Apps Script inside your Google Sheet to trigger instant database updates.
                      </p>
                    </div>

                    <button
                      onClick={copyScriptCode}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 px-3.5 py-2 text-xs font-bold transition cursor-pointer"
                    >
                      {copiedScript ? "Copied!" : "Copy App Script Code"}
                    </button>
                  </div>

                  <div className="mt-4 bg-slate-950 dark:bg-slate-955 p-4 rounded-lg overflow-x-auto text-[11px] font-mono text-emerald-400 whitespace-pre">
                    {`// App Script standard trigger
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  ...
}`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {googleSheetEmbedUrl ? (
            <div className="flex-1 min-h-0 w-full bg-white dark:bg-slate-900 relative">
              <iframe
                src={googleSheetEmbedUrl}
                className="h-full w-full border-none bg-white"
                title="Google Sheet Live View"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900/35">
              <div className="text-slate-400 mb-3 text-3xl">📁</div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Google Sheet URL connected</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                Paste your spreadsheet link above to enable the embedded preview panel in this tab.
              </p>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
