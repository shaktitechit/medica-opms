"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useListUsersQuery,
  useListRolesQuery,
  useCreateUserMutation,
  usePatchUserMutation,
} from "@/store/api";
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Loader2,
  ShieldCheck,
} from "lucide-react";

const DEPARTMENTS = ["super_admin", "admin", "sales", "finance", "dispatch"] as const;
type Dept = (typeof DEPARTMENTS)[number];

function extractList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.items)) return o.items;
  }
  return [];
}

function DeptBadge({ dept }: { dept: string }) {
  const colors: Record<string, string> = {
    super_admin: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
    admin: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
    sales: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    finance: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    dispatch: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  };
  const fmt = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[dept] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
      {fmt(dept)}
    </span>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", department: "sales" as Dept, roles: [] as string[] });
  const [createUser, { isLoading }] = useCreateUserMutation();
  const { data: rolesRaw } = useListRolesQuery();
  const roleList = useMemo(() => extractList(rolesRaw), [rolesRaw]);
  const availableRoles = useMemo(
    () => roleList.filter((r: any) => r.department === form.department),
    [roleList, form.department],
  );

  const defaultRoleIdForDept = (dept: Dept) => {
    const match = roleList.find(
      (r: any) => r.code === dept || r.department === dept,
    );
    return match ? String(match._id || match.id || "") : "";
  };
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (form.roles.length > 0 || !roleList.length) return;
    const defaultRole = defaultRoleIdForDept(form.department);
    if (defaultRole) {
      setForm((f) => ({ ...f, roles: [defaultRole] }));
    }
  }, [form.department, form.roles.length, roleList]);

  const resolveRoleIdsForSubmit = () => {
    const picked = form.roles.map((id) => String(id).trim()).filter(Boolean);
    if (picked.length > 0) return picked;
    const fallback = defaultRoleIdForDept(form.department);
    return fallback ? [fallback] : [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const roles = resolveRoleIdsForSubmit();
    if (!roles.length) {
      setError(
        "No role found for this department. Run backend seed:roles first, then try again.",
      );
      return;
    }

    try {
      await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        department: form.department,
        roles,
        roleCode: form.department,
      }).unwrap();
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err?.data?.error?.message ?? "Failed to create user.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-violet-600" />
            <h2 className="font-bold text-slate-900 dark:text-slate-100">Create User Account</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <CheckCircle className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">User created successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {[
              { field: "name", label: "Full Name", type: "text", placeholder: "John Doe", required: true },
              { field: "email", label: "Email Address", type: "email", placeholder: "john@company.com", required: true },
              { field: "phone", label: "Phone (optional)", type: "tel", placeholder: "+91 9876543210", required: false },
              { field: "password", label: "Password", type: "password", placeholder: "Min. 8 characters", required: true },
            ].map(({ field, label, type, placeholder, required }) => (
              <div key={field}>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
                <input
                  type={type}
                  value={(form as any)[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  required={required}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            ))}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Department</label>
              <div className="relative">
                <select
                  value={form.department}
                  onChange={(e) => {
                    const department = e.target.value as Dept;
                    const defaultRole = defaultRoleIdForDept(department);
                    setForm((f) => ({
                      ...f,
                      department,
                      roles: defaultRole ? [defaultRole] : [],
                    }));
                  }}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            </div>

            {availableRoles.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Role
                  {form.roles.length === 0 ? (
                    <span className="font-normal text-slate-500"> — defaults to department role on save</span>
                  ) : null}
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((r: any) => {
                    const rid = String(r._id || r.id || "");
                    const selected = form.roles.includes(rid);
                    return (
                      <button
                        key={rid}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, roles: selected ? f.roles.filter((x) => x !== rid) : [...f.roles, rid] }))}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${selected ? "bg-violet-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"}`}
                      >
                        {r.name || r.code}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create User
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Edit User Drawer ──────────────────────────────────────────────────────────

function EditUserDrawer({ user, onClose }: { user: any; onClose: () => void }) {
  const [patchUser, { isLoading }] = usePatchUserMutation();
  const [patch, setPatch] = useState({
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    department: user.department ?? "sales",
    is_active: user.is_active !== false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const uid = String(user._id || user.id || "");

  const handleSave = async () => {
    setError(null);
    try {
      await patchUser({ id: uid, patch }).unwrap();
      setSaved(true);
      setTimeout(onClose, 1000);
    } catch (err: any) {
      setError(err?.data?.error?.message ?? "Save failed.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <h2 className="font-bold text-slate-900 dark:text-slate-100">Edit User</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {saved ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <CheckCircle className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Saved!</p>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-auto p-5">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {[
              { field: "name", label: "Name", type: "text" },
              { field: "email", label: "Email", type: "email" },
              { field: "phone", label: "Phone", type: "tel" },
            ].map(({ field, label, type }) => (
              <div key={field}>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
                <input
                  type={type}
                  value={(patch as any)[field]}
                  onChange={(e) => setPatch((p) => ({ ...p, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            ))}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Department</label>
              <div className="relative">
                <select
                  value={patch.department}
                  onChange={(e) => setPatch((p) => ({ ...p, department: e.target.value }))}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-white/10">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Active Status</p>
                <p className="text-[10px] text-slate-500">User can log into the system</p>
              </div>
              <button
                type="button"
                onClick={() => setPatch((p) => ({ ...p, is_active: !p.is_active }))}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${patch.is_active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${patch.is_active ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperAdminUsersPage() {
  const { data: usersRaw, isFetching, isError, refetch } = useListUsersQuery({});
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);

  const userList = useMemo(() => extractList(usersRaw), [usersRaw]);

  const filtered = useMemo(() => {
    let list = userList;
    if (deptFilter !== "all") list = list.filter((u: any) => u.department === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u: any) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
    }
    return list;
  }, [userList, deptFilter, search]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { all: userList.length };
    for (const u of userList) {
      const d = u.department || "unknown";
      counts[d] = (counts[d] ?? 0) + 1;
    }
    return counts;
  }, [userList]);

  return (
    <div className="space-y-6 pb-10">
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && <EditUserDrawer user={editUser} onClose={() => setEditUser(null)} />}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">User Management</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {userList.length} total users across {Object.keys(deptCounts).filter((k) => k !== "all").length} departments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700">
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", ...DEPARTMENTS].map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${deptFilter === d ? "bg-violet-600 text-white shadow" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400"}`}
            >
              {d === "all" ? "All" : d.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              {deptCounts[d] !== undefined && (
                <span className="ml-1.5 tabular-nums opacity-70">({deptCounts[d]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        {isError && (
          <div className="flex items-center gap-2 p-5 text-sm text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Could not load users. Please try refreshing.
          </div>
        )}
        {isFetching && !userList.length ? (
          <div className="space-y-3 p-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500 dark:border-white/5 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">Phone</th>
                <th className="px-4 py-3 font-semibold text-center">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No users match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((u: any) => {
                  const uid = String(u._id || u.id || "");
                  const isActive = u.is_active !== false;
                  return (
                    <tr key={uid} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            {(u.name || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{u.name || "—"}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><DeptBadge dept={u.department || "unknown"} /></td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-600 dark:text-slate-400">{u.phone || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                            <CheckCircle className="h-2.5 w-2.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <XCircle className="h-2.5 w-2.5" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditUser(u)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
