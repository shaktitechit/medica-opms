"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAppSelector } from "@/store";
import {
  usePatchUserMutation,
  useGetAuthMeQuery,
  useGetCompanyInfoQuery,
  useGetCompanyDataQuery,
  useUpdateCompanyInfoMutation,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import {
  User,
  Mail,
  Phone,
  Key,
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Building2,
  FileText,
  Globe,
  MapPin,
  ShieldCheck,
  RotateCcw,
  Save,
  Copy,
  Check,
  Landmark,
  Calendar,
  Clock,
  Sparkles,
  Palette,
  Pipette,
  Users,
  Package,
  ShoppingCart,
  Truck,
  ClipboardList,
  DollarSign,
  Activity,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import {
  THEME_PALETTES,
  applyThemeVariables,
  type ThemePalettePreset,
} from "@/components/CompanyBrandingSync";

export type CompanyInfoData = {
  legalName: string;
  tradeName: string;
  gstin: string;
  cin: string;
  pan: string;
  drugLicense: string;
  fssai: string;
  email: string;
  billingEmail: string;
  phone: string;
  website: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  themePalette: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  currency: string;
  timezone: string;
  financialYear: string;
  invoiceFooterNote: string;
};

export const DEFAULT_COMPANY_INFO: CompanyInfoData = {
  legalName: "",
  tradeName: "",
  gstin: "",
  cin: "",
  pan: "",
  drugLicense: "",
  fssai: "",
  email: "",
  billingEmail: "",
  phone: "",
  website: "",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#636ccb",
  secondaryColor: "#6e8cfb",
  themePalette: "default",
  address: "",
  city: "",
  state: "",
  pincode: "",
  country: "",
  currency: "",
  timezone: "",
  financialYear: "",
  invoiceFooterNote: "",
};

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const portal = typeof params.portal === "string" ? params.portal : "admin";

  const user = useAppSelector((state) => state.auth.user);
  const { refetch: refetchAuthMe } = useGetAuthMeQuery();
  const [patchUser, { isLoading: isPatching }] = usePatchUserMutation();

  const isSuperAdmin =
    user?.department === "super_admin" || portal === "super_admin";

  const { data: dbCompanyData, refetch: refetchCompanyInfo } =
    useGetCompanyInfoQuery(undefined, { skip: !isSuperAdmin });
  const {
    data: parentCompanyData,
    isLoading: isLoadingParentData,
    refetch: refetchParentData,
  } = useGetCompanyDataQuery(undefined, { skip: !isSuperAdmin });
  const [updateCompanyInfoMutation, { isLoading: isUpdatingCompany }] =
    useUpdateCompanyInfoMutation();

  const tabQuery = searchParams.get("tab");
  const initialTab =
    (tabQuery === "company" && isSuperAdmin) ||
    tabQuery === "security" ||
    tabQuery === "info"
      ? tabQuery
      : "info";

  const [activeTab, setActiveTab] = useState<"info" | "company" | "security">(
    initialTab as "info" | "company" | "security"
  );

  useEffect(() => {
    if (activeTab === "company" && !isSuperAdmin) {
      setActiveTab("info");
    }
  }, [activeTab, isSuperAdmin]);

  // Profile fields state
  const [name, setName] = useState(String(user?.name || ""));
  const [phone, setPhone] = useState(String(user?.phone || ""));

  // Password fields state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Company Information state
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoData>(DEFAULT_COMPANY_INFO);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (dbCompanyData) {
      setCompanyInfo({
        legalName: dbCompanyData.legal_name || "",
        tradeName: dbCompanyData.trade_name || "",
        gstin: dbCompanyData.gstin || "",
        cin: dbCompanyData.cin || "",
        pan: dbCompanyData.pan || "",
        drugLicense: dbCompanyData.drug_license || "",
        fssai: dbCompanyData.fssai_license || "",
        email: dbCompanyData.email || "",
        billingEmail: dbCompanyData.billing_email || "",
        phone: dbCompanyData.phone || "",
        website: dbCompanyData.website || "",
        logoUrl: dbCompanyData.logo_url || "",
        faviconUrl: dbCompanyData.favicon_url || "",
        primaryColor: dbCompanyData.primary_color || "#636ccb",
        secondaryColor: dbCompanyData.secondary_color || "#6e8cfb",
        themePalette: dbCompanyData.theme_palette || "default",
        address: dbCompanyData.address || "",
        city: dbCompanyData.city || "",
        state: dbCompanyData.state || "",
        pincode: dbCompanyData.pincode || "",
        country: dbCompanyData.country || "",
        currency: dbCompanyData.currency || "",
        timezone: dbCompanyData.timezone || "",
        financialYear: dbCompanyData.financial_year || "",
        invoiceFooterNote: dbCompanyData.invoice_footer_note || "",
      });
    }
  }, [dbCompanyData]);

  const handleSelectPalette = (preset: ThemePalettePreset) => {
    setCompanyInfo((p) => ({
      ...p,
      themePalette: preset.id,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
    }));
    applyThemeVariables(preset.primary, preset.secondary, preset.darkPrimary);
    toast.success(`Applied ${preset.name} theme preview`);
  };

  const handleCustomColorChange = (
    key: "primaryColor" | "secondaryColor",
    val: string
  ) => {
    setCompanyInfo((p) => {
      const next = { ...p, [key]: val, themePalette: "custom" };
      applyThemeVariables(
        next.primaryColor,
        next.secondaryColor,
      );
      return next;
    });
  };

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copied ${key} to clipboard`);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: "logoUrl" | "faviconUrl") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image file size should be less than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCompanyInfo((prev) => ({ ...prev, [field]: result }));
        toast.success(`Selected image for ${field === "logoUrl" ? "Company Logo" : "Favicon"}`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompanyInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateCompanyInfoMutation({
        legal_name: companyInfo.legalName.trim(),
        trade_name: companyInfo.tradeName.trim(),
        gstin: companyInfo.gstin.trim().toUpperCase(),
        cin: companyInfo.cin.trim().toUpperCase(),
        pan: companyInfo.pan.trim().toUpperCase(),
        drug_license: companyInfo.drugLicense.trim(),
        fssai_license: companyInfo.fssai.trim(),
        email: companyInfo.email.trim(),
        billing_email: companyInfo.billingEmail.trim(),
        phone: companyInfo.phone.trim(),
        website: companyInfo.website.trim(),
        logo_url: companyInfo.logoUrl.trim(),
        favicon_url: companyInfo.faviconUrl.trim(),
        primary_color: companyInfo.primaryColor.trim() || "#636ccb",
        secondary_color: companyInfo.secondaryColor.trim() || "#6e8cfb",
        theme_palette: companyInfo.themePalette || "default",
        address: companyInfo.address.trim(),
        city: companyInfo.city.trim(),
        state: companyInfo.state.trim(),
        pincode: companyInfo.pincode.trim(),
        country: companyInfo.country.trim(),
        currency: companyInfo.currency.trim(),
        timezone: companyInfo.timezone.trim(),
        financial_year: companyInfo.financialYear.trim(),
        invoice_footer_note: companyInfo.invoiceFooterNote.trim(),
      }).unwrap();

      if (companyInfo.primaryColor) {
        applyThemeVariables(companyInfo.primaryColor, companyInfo.secondaryColor);
      }

      toast.success("Company Information & Theme Color updated successfully");
      refetchCompanyInfo();
      refetchParentData();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to save company information");
    }
  };

  if (!user) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-slate-500 dark:text-slate-400">Loading user profile...</p>
      </div>
    );
  }

  const email = String(user.email || "");
  const department = String(user.department || "sales");
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  // Friendly formatters
  const departmentLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Administrator",
    sales: "Sales Department",
    finance: "Finance Department",
    dispatch: "Logistics & Dispatch",
    account: "Accounts & Billing",
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      await patchUser({
        id: String(user._id),
        patch: { name: name.trim(), phone: phone.trim() },
      }).unwrap();

      toast.success("Profile updated successfully");
      refetchAuthMe();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      toast.error("Please enter a new password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      await patchUser({
        id: String(user._id),
        patch: { password: newPassword },
      }).unwrap();

      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* ── BREADCRUMB & HEADER ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => router.push(`/${portal}`)}
            className="hover:underline font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Dashboard
          </button>
          <span>/</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            User Profile
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {isSuperAdmin ? "Super Admin Account & Company Profile" : "My Account"}
          </h1>
          {companyInfo.legalName && isSuperAdmin ? (
            <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/20 dark:bg-indigo-950/40 dark:text-indigo-300">
              <Building2 className="size-3.5" />
              {companyInfo.legalName}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* ── LEFT PANEL: CARD OVERVIEW ── */}
        <div className="md:col-span-1 space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-bold text-white shadow-md ring-4 ring-blue-50 dark:ring-blue-950/20">
                {initial}
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-50">
                {user.name as string}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {email}
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-950/30 dark:text-blue-400">
                  {departmentLabels[department] || department}
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-950/30 dark:text-emerald-400">
                  Active
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">User ID</span>
                <code className="text-slate-900 dark:text-slate-300 font-mono select-all">
                  {String(user._id).slice(-8)}...
                </code>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Status</span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="size-3.5" /> Normal Session
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Access Level</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {isSuperAdmin ? "Root / Super Admin" : "Standard Portal"}
                </span>
              </div>
            </div>
          </div>

          {/* ── COMPANY SUMMARY BOX (LEFT SIDEBAR - SUPER ADMIN ONLY) ── */}
          {isSuperAdmin && (
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 shadow-sm dark:border-white/10 dark:from-slate-900 dark:to-slate-800/40">
              <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-100 font-semibold text-sm mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <Building2 className="size-4" />
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold">
                    Organization
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-50">
                    {companyInfo.tradeName || companyInfo.legalName || "Organization Profile"}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-start justify-between gap-2 border-t border-slate-200/60 dark:border-white/5 pt-2">
                  <span className="text-slate-500 dark:text-slate-400">GSTIN</span>
                  {companyInfo.gstin ? (
                    <button
                      type="button"
                      onClick={() => handleCopy(companyInfo.gstin, "GSTIN")}
                      className="inline-flex items-center gap-1 font-mono font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition"
                      title="Click to copy"
                    >
                      {companyInfo.gstin}
                      {copiedKey === "GSTIN" ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3 text-slate-400" />
                      )}
                    </button>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">Not specified</span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-2 border-t border-slate-200/60 dark:border-white/5 pt-2">
                  <span className="text-slate-500 dark:text-slate-400">Location</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {companyInfo.city || companyInfo.country
                      ? [companyInfo.city, companyInfo.country].filter(Boolean).join(", ")
                      : "Not specified"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 border-t border-slate-200/60 dark:border-white/5 pt-2">
                  <span className="text-slate-500 dark:text-slate-400">Configuration</span>
                  <span className="inline-flex items-center gap-1 rounded bg-blue-100/70 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    <Sparkles className="size-3" /> Database Sync
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("company")}
                className="mt-4 w-full rounded-xl border border-blue-200 bg-white py-2 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 dark:border-blue-800/40 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700 text-center block cursor-pointer"
              >
                View & Edit Company Details &rarr;
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: FORMS / DETAILS ── */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            {/* Tabs Header */}
            <div className="flex flex-wrap border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/10 px-4 pt-2 rounded-t-2xl">
              {[
                { id: "info", name: "Personal Details", icon: User },
                ...(isSuperAdmin
                  ? [
                      {
                        id: "company",
                        name: "Company Information",
                        icon: Building2,
                      },
                    ]
                  : []),
                { id: "security", name: "Security & Password", icon: Lock },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      setActiveTab(tab.id as "info" | "company" | "security")
                    }
                    className={`flex items-center gap-2 border-b-2 px-3.5 py-3 text-xs font-semibold transition-colors duration-150 active:scale-95 cursor-pointer ${
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    <Icon className="size-4" />
                    {tab.name}
                    {tab.id === "company" && isSuperAdmin && (
                      <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        Admin
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab Body */}
            <div className="p-6">
              {/* ── Tab 1: Personal Details ── */}
              {activeTab === "info" && (
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="profile-name"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Display Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 size-4 text-slate-400" />
                        <input
                          id="profile-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-4 text-xs font-medium text-slate-900 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 dark:placeholder-slate-500"
                          placeholder="Your Name"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="profile-phone"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 size-4 text-slate-400" />
                        <input
                          id="profile-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-4 text-xs font-medium text-slate-900 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 dark:placeholder-slate-500"
                          placeholder="E.g. +91 98765 43210"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Email Address (Read-only)
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 size-4 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        disabled
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs font-medium text-slate-400 dark:border-white/5 dark:bg-slate-950/40 dark:text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-white/5">
                    <button
                      type="submit"
                      disabled={isPatching}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
                    >
                      {isPatching ? "Updating..." : "Save Details"}
                    </button>
                  </div>
                </form>
              )}

              {/* ── Tab 2: Company Information ── */}
              {activeTab === "company" && isSuperAdmin && (
                <form onSubmit={handleSaveCompanyInfo} className="space-y-6">
                  {/* Hero Organization Banner */}
                  <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-slate-50 p-4 dark:border-blue-900/30 dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-slate-900/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
                          <Building2 className="size-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                              {companyInfo.legalName || "Parent Company & Organization Root"}
                            </h3>
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                              <ShieldCheck className="size-3" /> Parent Entity
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            Trade Brand: <strong className="font-semibold text-slate-800 dark:text-slate-200">{companyInfo.tradeName || "Not configured"}</strong> | Central parent of all system data
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            refetchParentData();
                            refetchCompanyInfo();
                            toast.success("Synchronized company parent data");
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          title="Refresh Company Data"
                        >
                          <RefreshCw className={`size-3.5 text-slate-400 ${isLoadingParentData ? "animate-spin" : ""}`} />
                          Sync
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(JSON.stringify({ companyInfo, metrics: parentCompanyData?.metrics }, null, 2), "Full Company JSON")}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <Copy className="size-3.5 text-slate-400" />
                          {copiedKey === "Full Company JSON" ? "Copied All!" : "Export JSON"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── PARENT COMPANY DATA & METRICS SUITE ── */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="size-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          Parent Company Data & System Metrics
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Live aggregation of all child data
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {/* Users Card */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Users & Team
                          </span>
                          <Users className="size-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            {parentCompanyData?.metrics?.users?.total ?? 0}
                          </span>
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            {parentCompanyData?.metrics?.users?.active ?? 0} active
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            Sales: {parentCompanyData?.metrics?.users?.departments?.sales ?? 0}
                          </span>
                          <span className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            Admin: {parentCompanyData?.metrics?.users?.departments?.admin ?? 0}
                          </span>
                          <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Fin/Acc: {(parentCompanyData?.metrics?.users?.departments?.finance ?? 0) + (parentCompanyData?.metrics?.users?.departments?.account ?? 0)}
                          </span>
                        </div>
                      </div>

                      {/* Parties Card */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Parties / Clients
                          </span>
                          <Building2 className="size-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            {parentCompanyData?.metrics?.parties?.total ?? 0}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            Accounts
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <span>{parentCompanyData?.metrics?.parties?.by_type?.customer ?? 0} Clients</span> • 
                          <span>{parentCompanyData?.metrics?.parties?.by_type?.supplier ?? 0} Suppliers</span>
                        </div>
                      </div>

                      {/* Product Catalog Card */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Product Catalog
                          </span>
                          <Package className="size-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            {parentCompanyData?.metrics?.catalog?.total_products ?? 0}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            SKUs
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <span>{parentCompanyData?.metrics?.catalog?.total_groups ?? 0} Groups</span> • 
                          <span>{parentCompanyData?.metrics?.catalog?.total_brands ?? 0} Brands</span>
                        </div>
                      </div>

                      {/* Orders Card */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Orders & Volume
                          </span>
                          <ShoppingCart className="size-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            {parentCompanyData?.metrics?.orders?.total ?? 0}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            Orders
                          </span>
                        </div>
                        <div className="mt-2 text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                          Vol: ₹{(parentCompanyData?.metrics?.orders?.total_revenue || 0).toLocaleString("en-IN")}
                        </div>
                      </div>

                      {/* Fleet & Logistics Card */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Fleet & Transport
                          </span>
                          <Truck className="size-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            {parentCompanyData?.metrics?.fleet?.vehicles ?? 0}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            Vehicles
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <span>{parentCompanyData?.metrics?.fleet?.drivers ?? 0} Drivers</span> • 
                          <span>{parentCompanyData?.metrics?.fleet?.transport_agents ?? 0} Agents</span>
                        </div>
                      </div>

                      {/* Field Operations Card */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Field Operations
                          </span>
                          <ClipboardList className="size-4 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            {parentCompanyData?.metrics?.field_operations?.work_plans ?? 0}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            Work Plans
                          </span>
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                          {parentCompanyData?.metrics?.field_operations?.visits ?? 0} Client Visits
                        </div>
                      </div>

                      {/* Financial Health Card */}
                      <div className="col-span-2 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Financial & Billing Tracking
                          </span>
                          <DollarSign className="size-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400">Open Unbilled Orders</span>
                            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                              {parentCompanyData?.metrics?.financials?.unbilled_orders ?? 0}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400">Active Due Sheets</span>
                            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                              {parentCompanyData?.metrics?.financials?.total_due_sheets ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 0: Brand Visuals & Icons (Dashboard Logo & Favicon) */}
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          Brand Visuals & Icons (Dashboard Logo & Browser Favicon)
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Updates sidebar logo & browser tab icon
                      </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Company Dashboard Logo */}
                      <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Dashboard Company Logo
                          </label>
                          {companyInfo.logoUrl ? (
                            <button
                              type="button"
                              onClick={() => setCompanyInfo((p) => ({ ...p, logoUrl: "" }))}
                              className="text-[11px] text-rose-600 hover:underline dark:text-rose-400 dark:hover:text-rose-300"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>

                        {/* Live Preview Box for Logo */}
                        <div className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-slate-250 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-slate-950/40">
                          {companyInfo.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={companyInfo.logoUrl}
                              alt="Company Logo Preview"
                              className="max-h-12 max-w-full object-contain"
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                              <Building2 className="size-4 text-slate-400" />
                              <span>Default Logo Active (/medica-logo.png)</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <input
                            type="text"
                            value={companyInfo.logoUrl}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, logoUrl: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="Paste Logo Image URL (e.g. https://...)"
                          />

                          {isSuperAdmin && (
                            <label className="flex items-center justify-center gap-2 rounded-lg border border-slate-250 bg-white py-1.5 px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                              <span>Choose Image File...</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, "logoUrl")}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Company Favicon */}
                      <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Browser Tab Favicon
                          </label>
                          {companyInfo.faviconUrl ? (
                            <button
                              type="button"
                              onClick={() => setCompanyInfo((p) => ({ ...p, faviconUrl: "" }))}
                              className="text-[11px] text-rose-600 hover:underline dark:text-rose-400 dark:hover:text-rose-300"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>

                        {/* Browser Tab Simulation Preview */}
                        <div className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-slate-250 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-slate-950/40">
                          <div className="flex items-center gap-2 rounded-lg border border-slate-250/80 bg-white px-3 py-1.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
                            {companyInfo.faviconUrl || companyInfo.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={companyInfo.faviconUrl || companyInfo.logoUrl}
                                alt="Favicon Preview"
                                className="size-4.5 rounded object-contain"
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src="/medica-fabicon.svg"
                                alt="Default Favicon"
                                className="size-4.5 rounded object-contain"
                              />
                            )}
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[130px]">
                              {companyInfo.tradeName || companyInfo.legalName || "Medica OPMS"}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <input
                            type="text"
                            value={companyInfo.faviconUrl}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, faviconUrl: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="Paste Favicon URL (.ico, .svg, .png)"
                          />

                          {isSuperAdmin && (
                            <label className="flex items-center justify-center gap-2 rounded-lg border border-slate-250 bg-white py-1.5 px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                              <span>Choose Favicon File...</span>
                              <input
                                type="file"
                                accept="image/*,.ico"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, "faviconUrl")}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 0B: Brand Theme Color & UI Palette (App-Wide) */}
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <Palette className="size-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          App-Wide Theme Color Palette
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Updates theme accent, buttons, tabs, and brand highlights across all portals
                      </span>
                    </div>

                    {/* Presets Grid */}
                    <div className="max-h-[380px] overflow-y-auto overscroll-contain pr-1 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                      {THEME_PALETTES.map((preset) => {
                        const isSelected =
                          companyInfo.themePalette === preset.id ||
                          (!companyInfo.themePalette && preset.id === "default") ||
                          (companyInfo.primaryColor.toLowerCase() === preset.primary.toLowerCase() &&
                            companyInfo.themePalette !== "custom");
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            disabled={!isSuperAdmin}
                            onClick={() => handleSelectPalette(preset)}
                            className={`group relative flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary-muted shadow-sm ring-2 ring-primary/25"
                                : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                            }`}
                          >
                            <div className="flex w-full items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span
                                  className="size-4.5 rounded-full shadow-inner ring-2 ring-white dark:ring-slate-900"
                                  style={{ backgroundColor: preset.primary }}
                                />
                                <span
                                  className="size-3.5 -ml-1 rounded-full shadow-inner ring-2 ring-white dark:ring-slate-900 opacity-90"
                                  style={{ backgroundColor: preset.secondary }}
                                />
                              </div>
                              {isSelected && (
                                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xs">
                                  <Check className="size-2.5 stroke-[3]" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 w-full">
                              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-50">
                                {preset.name}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                {preset.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Color Picker & Live Component Previews */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                        <div className="flex items-center gap-2">
                          <Pipette className="size-4 text-blue-600 dark:text-blue-400" />
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Custom Brand Colors
                          </label>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Primary Brand Color
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={companyInfo.primaryColor || "#636ccb"}
                                disabled={!isSuperAdmin}
                                onChange={(e) =>
                                  handleCustomColorChange("primaryColor", e.target.value)
                                }
                                className="h-8 w-10 cursor-pointer rounded-lg border border-slate-250 bg-transparent p-0.5"
                              />
                              <input
                                type="text"
                                value={companyInfo.primaryColor || ""}
                                disabled={!isSuperAdmin}
                                onChange={(e) =>
                                  handleCustomColorChange("primaryColor", e.target.value)
                                }
                                className="flex-1 font-mono uppercase rounded-xl border border-slate-250/90 bg-white py-1.5 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 dark:placeholder-slate-500 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                                placeholder="#636CCB"
                              />
                            </div>
                          </div>

                          <div>
                            <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Accent / Ring Glow Color
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={companyInfo.secondaryColor || "#6e8cfb"}
                                disabled={!isSuperAdmin}
                                onChange={(e) =>
                                  handleCustomColorChange("secondaryColor", e.target.value)
                                }
                                className="h-8 w-10 cursor-pointer rounded-lg border border-slate-250 bg-transparent p-0.5"
                              />
                              <input
                                type="text"
                                value={companyInfo.secondaryColor || ""}
                                disabled={!isSuperAdmin}
                                onChange={(e) =>
                                  handleCustomColorChange("secondaryColor", e.target.value)
                                }
                                className="flex-1 font-mono uppercase rounded-xl border border-slate-250/90 bg-white py-1.5 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 dark:placeholder-slate-500 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                                placeholder="#6E8CFB"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Live Component Preview Card */}
                      <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-slate-950/40">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Live UI Component Preview
                        </label>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Here is how buttons, active tabs, and badges look in real-time with the active palette:
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95"
                          >
                            Primary Action
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-blue-600/40 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          >
                            Muted Button
                          </button>
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-700/20 dark:bg-blue-950/50 dark:text-blue-300">
                            <Sparkles className="size-3" /> Live Theme Active
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Legal & Tax Identifiers */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-white/5">
                      <Landmark className="size-4 text-blue-600 dark:text-blue-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Legal & Tax Identification
                      </h4>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Legal Registered Entity Name
                        </label>
                        <input
                          type="text"
                          value={companyInfo.legalName}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setCompanyInfo({ ...companyInfo, legalName: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. Acme Healthcare Pvt. Ltd."
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Trade / Brand Name
                        </label>
                        <input
                          type="text"
                          value={companyInfo.tradeName}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setCompanyInfo({ ...companyInfo, tradeName: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. Acme Pharma"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            GSTIN (Goods & Services Tax ID)
                          </label>
                          {companyInfo.gstin ? (
                            <button
                              type="button"
                              onClick={() => handleCopy(companyInfo.gstin, "GSTIN")}
                              className="text-[11px] text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300 inline-flex items-center gap-1"
                            >
                              <Copy className="size-3" /> Copy
                            </button>
                          ) : null}
                        </div>
                        <input
                          type="text"
                          value={companyInfo.gstin}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setCompanyInfo({ ...companyInfo, gstin: e.target.value.toUpperCase() })
                          }
                          className="w-full font-mono uppercase rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. 27AAAAA0000A1Z5"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Corporate ID Number (CIN)
                        </label>
                        <input
                          type="text"
                          value={companyInfo.cin}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setCompanyInfo({ ...companyInfo, cin: e.target.value.toUpperCase() })
                          }
                          className="w-full font-mono uppercase rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. U24232MH2020PTC123456"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Drug License Numbers (20B / 21B)
                        </label>
                        <input
                          type="text"
                          value={companyInfo.drugLicense}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setCompanyInfo({ ...companyInfo, drugLicense: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. 20B-MH-TZ1-000000 / 21B-MH-TZ1-000000"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          FSSAI License / PAN
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={companyInfo.fssai}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, fssai: e.target.value })
                            }
                            className="w-full font-mono rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="FSSAI Number"
                          />
                          <input
                            type="text"
                            value={companyInfo.pan}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, pan: e.target.value.toUpperCase() })
                            }
                            className="w-full font-mono uppercase rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="PAN Number"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Contact & Headquarters Address */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-white/5">
                      <MapPin className="size-4 text-blue-600 dark:text-blue-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Contact Details & Headquarters
                      </h4>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Corporate Support Email
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 size-4 text-slate-400" />
                          <input
                            type="email"
                            value={companyInfo.email}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, email: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="contact@company.com"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Billing & Accounts Email
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 size-4 text-slate-400" />
                          <input
                            type="email"
                            value={companyInfo.billingEmail}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, billingEmail: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="accounts@company.com"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Corporate Helpline & Phone
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-2.5 size-4 text-slate-400" />
                          <input
                            type="text"
                            value={companyInfo.phone}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, phone: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="+91 (022) 1234-5678"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Website & Portal Domain
                        </label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-2.5 size-4 text-slate-400" />
                          <input
                            type="text"
                            value={companyInfo.website}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, website: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="https://company.com"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Headquarters Address
                        </label>
                        <input
                          type="text"
                          value={companyInfo.address}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setCompanyInfo({ ...companyInfo, address: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="Street Address, Industrial Complex / Building"
                        />
                      </div>

                      <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            City
                          </label>
                          <input
                            type="text"
                            value={companyInfo.city}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, city: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="City"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            State
                          </label>
                          <input
                            type="text"
                            value={companyInfo.state}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, state: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="State"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            PIN Code
                          </label>
                          <input
                            type="text"
                            value={companyInfo.pincode}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, pincode: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="PIN Code"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            Country
                          </label>
                          <input
                            type="text"
                            value={companyInfo.country}
                            disabled={!isSuperAdmin}
                            onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, country: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                            placeholder="Country"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Operational & System Parameters */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-white/5">
                      <Clock className="size-4 text-blue-600 dark:text-blue-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Operational & System Settings
                      </h4>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Base Currency
                        </label>
                        <input
                          type="text"
                          value={companyInfo.currency}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, currency: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. INR (₹) or USD ($)"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          System Timezone
                        </label>
                        <input
                          type="text"
                          value={companyInfo.timezone}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, timezone: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. Asia/Kolkata"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Financial Year Cycle
                        </label>
                        <input
                          type="text"
                          value={companyInfo.financialYear}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                              setCompanyInfo({ ...companyInfo, financialYear: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="e.g. April 1 – March 31"
                        />
                      </div>

                      <div className="sm:col-span-3 space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Default Letterhead & Invoice Terms Note
                        </label>
                        <textarea
                          rows={2}
                          value={companyInfo.invoiceFooterNote}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setCompanyInfo({
                              ...companyInfo,
                              invoiceFooterNote: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-250/90 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-950/40 dark:disabled:text-slate-500"
                          placeholder="Standard terms and jurisdiction disclaimer for statements..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Super Admin Save Controls */}
                  {isSuperAdmin ? (
                    <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                      <button
                        type="submit"
                        disabled={isUpdatingCompany}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
                      >
                        <Save className="size-3.5" />
                        {isUpdatingCompany ? "Saving to Database..." : "Save Company Information"}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-white/5 dark:bg-slate-950/40 dark:text-slate-400">
                      Note: Company Information is managed centrally by Super Administrators. Contact your system admin to request changes.
                    </div>
                  )}
                </form>
              )}

              {/* ── Tab 3: Security & Password ── */}
              {activeTab === "security" && (
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-amber-250/40 bg-amber-50/30 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-300 flex items-start gap-2">
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                      <div>
                        Changing your password will encrypt the new credential immediately. Please store your password securely.
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="new-pass"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                        >
                          New Password
                        </label>
                        <div className="relative">
                          <Key className="absolute left-3 top-2.5 size-4 text-slate-400" />
                          <input
                            id="new-pass"
                            type={showPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-10 text-xs font-medium text-slate-900 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 dark:placeholder-slate-500"
                            placeholder="Min 6 characters"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((p) => !p)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400"
                          >
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="confirm-pass"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                        >
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Key className="absolute left-3 top-2.5 size-4 text-slate-400" />
                          <input
                            id="confirm-pass"
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full rounded-xl border border-slate-250/90 bg-white py-2 pl-9 pr-10 text-xs font-medium text-slate-900 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50 dark:placeholder-slate-500"
                            placeholder="Re-type new password"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-white/5">
                    <button
                      type="submit"
                      disabled={isPatching}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
                    >
                      {isPatching ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

