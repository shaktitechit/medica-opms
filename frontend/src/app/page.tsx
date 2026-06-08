import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  TrendingUp,
  Landmark,
  Boxes,
  ShieldCheck,
  Shield,
  Activity,
  Layers,
  Sparkles
} from "lucide-react";

import { resolveHomeDashboardPath } from "@/constants/dashboardAccess";
import {
  DEPT_HINT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionCookie";
import { MedicaLogo } from "@/components/MedicaLogo";
import PortalShowcase from "./PortalShowcase";

export default async function Home() {
  const jar = await cookies();
  const hasSession = jar.get(SESSION_COOKIE_NAME)?.value === "1";
  const deptRaw = jar.get(DEPT_HINT_COOKIE_NAME)?.value ?? "";

  let dept = deptRaw.trim().toLowerCase();
  try {
    dept = dept ? decodeURIComponent(dept).trim().toLowerCase() : "";
  } catch {
    dept = deptRaw.trim().toLowerCase();
  }

  if (hasSession && dept) {
    const home = resolveHomeDashboardPath(dept);
    if (home) redirect(home);
  }

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground flex flex-col font-sans">
      
      {/* Sticky Premium Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md transition-all duration-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MedicaLogo priority />
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-muted text-primary border border-primary/25">
              <Sparkles className="w-2.5 h-2.5" />
              OPMS v1.2
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-muted">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#modules" className="hover:text-foreground transition-colors">Portals</a>
            <a href="#metrics" className="hover:text-foreground transition-colors">Performance</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-xs font-semibold text-muted hover:text-foreground transition-colors"
            >
              Operator Login
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-md hover:bg-primary-hover transition-all duration-200 hover:scale-[1.02]"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col">
        
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 pb-20 lg:pt-28 lg:pb-32">
          {/* Glassmorphic Background Blobs */}
          <div className="absolute top-[-10%] left-[-15%] w-[60%] h-[60%] rounded-full bg-blue-500/10 blur-[130px] pointer-events-none" />
          <div className="absolute bottom-[20%] right-[-15%] w-[55%] h-[55%] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center text-center">
            
            {/* Announcement badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-muted text-primary border border-primary/25 mb-6 animate-pulse">
              <Activity className="w-3.5 h-3.5" />
              Unifying Enterprise Healthcare Operations
            </div>

            <h1 className="text-[2.25rem] sm:text-[3.5rem] lg:text-[4rem] font-extrabold leading-[1.1] tracking-tight text-foreground max-w-4xl">
              Order & Operations <br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-violet-400">
                Management Portal Suite
              </span>
            </h1>

            <p className="mt-6 text-sm sm:text-base text-muted max-w-2xl leading-relaxed">
              A comprehensive operational middleware system for Medica Enterprises. Empower your teams by seamlessly coordinating outpatient sales, credit audits, ledger balances, and logistics dispatch under a single secure, role-restricted dashboard.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
              <Link
                href="/login"
                className="group relative flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover transition duration-300 scale-100 hover:scale-[1.03]"
              >
                Access Portal Workspaces
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#modules"
                className="rounded-full border border-border bg-card/60 px-7 py-3 text-xs sm:text-sm font-bold text-foreground hover:bg-card transition duration-300 backdrop-blur-sm"
              >
                Explore Department Hubs
              </a>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section id="features" className="py-20 border-t border-border/60 bg-muted/5 relative">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                Built to solve medical logistic challenges
              </h2>
              <p className="mt-3 text-sm text-muted">
                Engineered with high performance and data integrity in mind. Unify your clinic partners, warehouses, and carriers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center mb-4">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Outpatient Order Capture</h3>
                  <p className="mt-2 text-xs text-muted leading-relaxed">
                    Sales reps can instantly select customer parties, check current credit status, and submit pharmaceutical bookings on the road.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Credit & Collection Audits</h3>
                  <p className="mt-2 text-xs text-muted leading-relaxed">
                    Ensure perfect bookkeeping. Match customer invoice clearances and verify balance sheets before orders are sent to warehouses.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center mb-4">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Logistics & Dispatch</h3>
                  <p className="mt-2 text-xs text-muted leading-relaxed">
                    Manage driver shifts, track vehicle assignments, generate freight sheets, and collaborate with registered third-party transport agents.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Granular Operator Security</h3>
                  <p className="mt-2 text-xs text-muted leading-relaxed">
                    Protect operations with strict role-based cookie enforcement. Users are automatically routed based on verified department credentials.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Interactive Sandbox Showcase */}
        <section id="modules" className="py-20 border-t border-border/60">
          <PortalShowcase />
        </section>

        {/* Performance & Metrics Section */}
        <section id="metrics" className="py-16 border-t border-b border-border/60 bg-muted/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <p className="text-[2rem] sm:text-[2.75rem] font-extrabold tracking-tight text-blue-500">124k+</p>
              <p className="mt-1 text-xs font-semibold text-muted uppercase">Bookings Managed</p>
            </div>
            <div className="text-center">
              <p className="text-[2rem] sm:text-[2.75rem] font-extrabold tracking-tight text-indigo-500">99.98%</p>
              <p className="mt-1 text-xs font-semibold text-muted uppercase">Platform Uptime</p>
            </div>
            <div className="text-center">
              <p className="text-[2rem] sm:text-[2.75rem] font-extrabold tracking-tight text-violet-500">45s</p>
              <p className="mt-1 text-xs font-semibold text-muted uppercase">Avg. Audit Clearance</p>
            </div>
            <div className="text-center">
              <p className="text-[2rem] sm:text-[2.75rem] font-extrabold tracking-tight text-emerald-500">&lt; 0.1%</p>
              <p className="mt-1 text-xs font-semibold text-muted uppercase">Logistics Discrepancy</p>
            </div>
          </div>
        </section>

        {/* CTA Bottom Banner */}
        <section className="py-20 relative overflow-hidden bg-card border-b border-border/60">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
          
          <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Ready to streamline your medical logistics?
            </h2>
            <p className="mt-4 text-sm text-muted max-w-xl mx-auto">
              Access your department's secure dashboard. Request access credentials from your system administrator if you are a new operator.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-xs font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover transition duration-300 hover:scale-[1.02]"
              >
                Sign In to Department
                <ArrowRight className="w-4.5 h-4.5" />
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <MedicaLogo className="opacity-90 hover:opacity-100 transition-opacity" />
            <span className="text-[10px] text-muted font-medium border-l border-border pl-2.5">OPMS Workspace System</span>
          </div>
          <p className="text-[10px] text-muted md:order-last">
            &copy; {new Date().getFullYear()} Medica Enterprises Inc. All rights reserved.
          </p>
          <div className="flex gap-6 text-[10px] text-muted">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-foreground transition-colors">System Status</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
