"use client";

import { useState } from "react";
import {
  TrendingUp,
  Landmark,
  Boxes,
  ShieldCheck,
  CheckCircle,
  Truck,
  Building2,
  Users,
  ArrowRight,
  ClipboardList,
  DollarSign,
  Package,
  Activity,
  UserCheck
} from "lucide-react";

type Department = "sales" | "finance" | "dispatch" | "admin";

export default function PortalShowcase() {
  const [activeDept, setActiveDept] = useState<Department>("sales");

  // Interactive mock states
  const [salesOrderStatus, setSalesOrderStatus] = useState<"pending_finance" | "approved">("pending_finance");
  const [financeApprovedCount, setFinanceApprovedCount] = useState(12);
  const [dispatchStatus, setDispatchStatus] = useState<"loading" | "transit" | "delivered">("loading");
  const [adminUserCount, setAdminUserCount] = useState(18);

  const departments = [
    {
      id: "sales" as Department,
      name: "Sales Portal",
      icon: TrendingUp,
      badge: "Orders & Leads",
      colorClass: "from-blue-500 to-indigo-600",
      textColor: "text-blue-500",
      bgMuted: "bg-blue-500/10",
      description: "Empower field reps to register customer parties, browse dynamic product catalogs, and book orders. Integrated credit limits prevent high-risk orders automatically.",
      features: [
        "Dynamic party matching with address lookup",
        "Interactive product pricing & catalog grids",
        "Instant booking and order status tracking"
      ]
    },
    {
      id: "finance" as Department,
      name: "Finance Portal",
      icon: Landmark,
      badge: "Audits & Ledger",
      colorClass: "from-emerald-500 to-teal-600",
      textColor: "text-emerald-500",
      bgMuted: "bg-emerald-500/10",
      description: "Manage accounts receivable and payable. Audit sales bookings against customer ledgers, approve credit limits, and match collection deposits in real-time.",
      features: [
        "Real-time order audit & credit matching",
        "Customer ledger balance history analysis",
        "Direct receipt matching against bank deposits"
      ]
    },
    {
      id: "dispatch" as Department,
      name: "Dispatch Portal",
      icon: Boxes,
      badge: "Fleet & Logistics",
      colorClass: "from-violet-500 to-fuchsia-600",
      textColor: "text-violet-500",
      bgMuted: "bg-violet-500/10",
      description: "Manage transport logistics. Assign delivery drivers, allocate trucks, track route assignments, and match shipments with external third-party transport agents.",
      features: [
        "Driver queue management & vehicle assignment",
        "Transport agent booking & cost comparison",
        "Automated shipping manifest generation"
      ]
    },
    {
      id: "admin" as Department,
      name: "Control & Admin",
      icon: ShieldCheck,
      badge: "Governance",
      colorClass: "from-amber-500 to-orange-600",
      textColor: "text-amber-500",
      bgMuted: "bg-amber-500/10",
      description: "Complete control center for system operators. Configure product registries, manage corporate user profiles, define department routing policies, and monitor system health.",
      features: [
        "Fine-grained role & department policies",
        "Global audit log & database transaction tracking",
        "Master data manager (Products & Parties registry)"
      ]
    }
  ];

  const currentDept = departments.find((d) => d.id === activeDept)!;

  return (
    <div className="w-full max-w-6xl mx-auto mt-16 px-4">
      <div className="text-center mb-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-muted text-primary border border-primary/20">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          Interactive System Explorer
        </span>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Designed for every department
        </h2>
        <p className="mt-3 text-base text-muted max-w-2xl mx-auto">
          Medica OPMS coordinates actions across departments under a unified data flow. Click below to preview how each specialized portal operates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Navigation Tabs (col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {departments.map((dept) => {
            const Icon = dept.icon;
            const isActive = activeDept === dept.id;
            return (
              <button
                key={dept.id}
                onClick={() => setActiveDept(dept.id)}
                className={`relative flex items-start gap-4 p-5 rounded-xl border text-left transition-all duration-300 ${
                  isActive
                    ? "border-primary bg-card shadow-lg shadow-primary/5 scale-[1.02] z-10"
                    : "border-border bg-card/40 hover:bg-card/90 hover:scale-[1.01]"
                }`}
              >
                {isActive && (
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b ${dept.colorClass}`} />
                )}
                <div className={`p-2.5 rounded-lg ${isActive ? dept.bgMuted : "bg-muted/10"} ${dept.textColor} transition-colors`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground text-sm">{dept.name}</h3>
                    <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${dept.bgMuted} ${dept.textColor}`}>
                      {dept.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                    {dept.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Dynamic Mockup Preview (col-span-7) */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="flex-1 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden relative min-h-[350px]">
            {/* Window chrome header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-b border-border">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-2 text-2xs font-mono text-muted/80">medica.opms://{activeDept}-portal</span>
              </div>
              <div className="flex items-center gap-1 text-2xs font-semibold text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>Live Sandbox</span>
              </div>
            </div>

            {/* Mockup screen content */}
            <div className="flex-1 p-6 flex flex-col justify-between">
              {/* Sales Mockup */}
              {activeDept === "sales" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">Active Booking Session</h4>
                      <p className="text-lg font-bold text-foreground mt-0.5">Create New Outpatient Booking</p>
                    </div>
                    <span className="text-xs text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Sales Mode</span>
                  </div>

                  <div className="p-4 rounded-xl bg-muted/5 border border-border/80 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-foreground">Customer: City Health Pharmacy</p>
                        <p className="text-2xs text-muted">ID: PARTY-98213 • Credit Status: Healthy</p>
                      </div>
                    </div>

                    <div className="border-t border-border/50 pt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-medium text-foreground">Med-Aspirin 100mg (Box of 500)</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">Qty: 250 • $1,250.00</span>
                    </div>

                    <div className="border-t border-border/50 pt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-medium text-foreground">Amoxicillin 250mg Suspension</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">Qty: 100 • $850.00</span>
                    </div>

                    <div className="border-t border-border/50 pt-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Est. Total:</span>
                      <span className="text-sm font-extrabold text-blue-500">$2,100.00</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-blue-500/5 border border-blue-500/20 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-blue-500/10">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">Order status:</p>
                        <p className="text-2xs text-muted">
                          {salesOrderStatus === "pending_finance" ? "Awaiting Finance Audit" : "Approved by Finance"}
                        </p>
                      </div>
                    </div>
                    {salesOrderStatus === "pending_finance" ? (
                      <button
                        onClick={() => {
                          setSalesOrderStatus("approved");
                          setFinanceApprovedCount((c) => c + 1);
                        }}
                        className="text-2xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition px-2.5 py-1 rounded"
                      >
                        Submit to Audit
                      </button>
                    ) : (
                      <button
                        onClick={() => setSalesOrderStatus("pending_finance")}
                        className="text-2xs font-bold text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 transition px-2.5 py-1 rounded"
                      >
                        Reset Mockup
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Finance Mockup */}
              {activeDept === "finance" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">Credit Audit Queue</h4>
                      <p className="text-lg font-bold text-foreground mt-0.5">Billing & Accounts Receivable</p>
                    </div>
                    <span className="text-xs text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Finance Active</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/5 border border-border/80 rounded-xl">
                      <p className="text-2xs font-semibold text-muted uppercase">Pending Audit</p>
                      <p className="text-lg font-extrabold text-foreground mt-1">4 Orders</p>
                    </div>
                    <div className="p-3 bg-muted/5 border border-border/80 rounded-xl">
                      <p className="text-2xs font-semibold text-muted uppercase">Approved Today</p>
                      <p className="text-lg font-extrabold text-emerald-500 mt-1">{financeApprovedCount} Orders</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/70 space-y-2.5 bg-card">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">Awaiting Credit Check:</span>
                      <span className="text-2xs font-bold bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">Pending Audit</span>
                    </div>
                    <div className="text-2xs text-muted space-y-1">
                      <p>• Client: Apex Global Clinics</p>
                      <p>• Order Value: $4,560.00 • Account Balance: -$1,200.00</p>
                      <p>• Credit Limit Status: <span className="text-emerald-500 font-medium">Clear</span></p>
                    </div>
                    <button
                      onClick={() => {
                        setFinanceApprovedCount((c) => c + 1);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition font-bold py-2 rounded-lg"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approved for Dispatch
                    </button>
                  </div>
                </div>
              )}

              {/* Dispatch Mockup */}
              {activeDept === "dispatch" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">Logistics Dashboard</h4>
                      <p className="text-lg font-bold text-foreground mt-0.5">Assign Carrier & Route</p>
                    </div>
                    <span className="text-xs text-violet-500 font-bold bg-violet-500/10 px-2 py-0.5 rounded">Logistics</span>
                  </div>

                  <div className="p-3.5 bg-muted/5 border border-border/80 rounded-xl space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-foreground">Shipment #TRK-8921</span>
                      <span className={`text-2xs font-bold px-2 py-0.5 rounded uppercase ${
                        dispatchStatus === "loading"
                          ? "bg-amber-500/10 text-amber-500"
                          : dispatchStatus === "transit"
                          ? "bg-blue-500/10 text-blue-500 animate-pulse"
                          : "bg-emerald-500/10 text-emerald-500"
                      }`}>
                        {dispatchStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setDispatchStatus("loading")}
                        className={`p-2 rounded text-2xs font-bold text-center border transition ${
                          dispatchStatus === "loading" ? "bg-violet-500/10 border-violet-500 text-violet-500" : "bg-card border-border text-muted"
                        }`}
                      >
                        1. Loading
                      </button>
                      <button
                        onClick={() => setDispatchStatus("transit")}
                        className={`p-2 rounded text-2xs font-bold text-center border transition ${
                          dispatchStatus === "transit" ? "bg-violet-500/10 border-violet-500 text-violet-500" : "bg-card border-border text-muted"
                        }`}
                      >
                        2. In Transit
                      </button>
                      <button
                        onClick={() => setDispatchStatus("delivered")}
                        className={`p-2 rounded text-2xs font-bold text-center border transition ${
                          dispatchStatus === "delivered" ? "bg-violet-500/10 border-violet-500 text-violet-500" : "bg-card border-border text-muted"
                        }`}
                      >
                        3. Delivered
                      </button>
                    </div>

                    <div className="relative pt-3">
                      <div className="h-1 bg-border rounded-full w-full">
                        <div
                          className="h-1 bg-violet-500 rounded-full transition-all duration-500"
                          style={{
                            width: dispatchStatus === "loading" ? "15%" : dispatchStatus === "transit" ? "60%" : "100%",
                          }}
                        />
                      </div>
                      <div className="flex justify-between items-center mt-2 text-2xs text-muted">
                        <span>Central Warehouse</span>
                        <span>Route 4-B</span>
                        <span>Medica Clinic</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 border border-border/60 rounded-xl bg-card">
                    <Truck className="w-5 h-5 text-violet-500" />
                    <div className="flex-1 text-xs">
                      <p className="font-semibold text-foreground">Driver: Johnathan Doe</p>
                      <p className="text-2xs text-muted">Vehicle: Volvo FH16 (Plate: MC-9021) • Temp Control: 4.5°C</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Mockup */}
              {activeDept === "admin" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">Access Registry</h4>
                      <p className="text-lg font-bold text-foreground mt-0.5">User Roles & Master Registry</p>
                    </div>
                    <span className="text-xs text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded">Security Root</span>
                  </div>

                  <div className="p-3.5 bg-muted/5 border border-border/80 rounded-xl space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">Current Active Operators:</span>
                      <span className="text-xs font-bold bg-primary-muted text-primary px-2 py-0.5 rounded">{adminUserCount} Users</span>
                    </div>
                    <p className="text-2xs text-muted leading-relaxed">
                      Control security tokens, clear cached DB entries, or provision new accounts. Toggle simulated team growth:
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAdminUserCount((c) => c + 1)}
                        className="text-2xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition px-3 py-1 rounded"
                      >
                        + Create Account
                      </button>
                      <button
                        onClick={() => setAdminUserCount(18)}
                        className="text-2xs font-bold text-muted bg-card hover:bg-muted/10 border border-border transition px-3 py-1 rounded"
                      >
                        Reset System
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-2xs font-bold text-muted uppercase tracking-wider">Recent System Audit Log</p>
                    <div className="border border-border/60 rounded-xl overflow-hidden text-2xs font-mono divide-y divide-border/40 bg-card">
                      <div className="p-2 flex justify-between">
                        <span className="text-emerald-500">[AUTH] User admin_dept signed in</span>
                        <span className="text-muted">10s ago</span>
                      </div>
                      <div className="p-2 flex justify-between">
                        <span className="text-blue-500">[SALES] Booked order #M-2024-89</span>
                        <span className="text-muted">2m ago</span>
                      </div>
                      <div className="p-2 flex justify-between">
                        <span className="text-violet-500">[LOGISTICS] Assigned Truck MC-9021</span>
                        <span className="text-muted">5m ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom footer helper in mockup screen */}
              <div className="border-t border-border/50 pt-4 mt-4 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-muted/70" />
                  Operator Session
                </span>
                <span className="font-mono text-2xs bg-muted/15 px-1.5 py-0.5 rounded">API: OK (200)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
