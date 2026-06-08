"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppSelector } from "@/store";
import { usePatchUserMutation, useGetAuthMeQuery } from "@/store/api";
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
} from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams();
  const portal = typeof params.portal === "string" ? params.portal : "admin";

  const user = useAppSelector((state) => state.auth.user);
  const { refetch: refetchAuthMe } = useGetAuthMeQuery();
  const [patchUser, { isLoading: isPatching }] = usePatchUserMutation();

  const [activeTab, setActiveTab] = useState<"info" | "security">("info");

  // Profile fields state
  const [name, setName] = useState(String(user?.name || ""));
  const [phone, setPhone] = useState(String(user?.phone || ""));

  // Password fields state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
            className="hover:underline font-medium text-blue-600 dark:text-blue-400"
          >
            Dashboard
          </button>
          <span>/</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            User Profile
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          My Account
        </h1>
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
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: FORMS / DETAILS ── */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            {/* Tabs Header */}
            <div className="flex border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/10 px-4 pt-2 rounded-t-2xl">
              {(
                [
                  { id: "info", name: "Personal Details", icon: User },
                  { id: "security", name: "Security & Password", icon: Lock },
                ] as const
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition-colors duration-150 active:scale-95 ${
                      isActive
                        ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    <Icon className="size-4" />
                    {tab.name}
                  </button>
                );
              })}
            </div>

            {/* Tab Body */}
            <div className="p-6">
              {/* Tab 1: Personal Details */}
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
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                    >
                      {isPatching ? "Updating..." : "Save Details"}
                    </button>
                  </div>
                </form>
              )}

              {/* Tab 2: Security */}
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
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-500"
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
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
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
