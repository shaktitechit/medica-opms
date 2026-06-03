import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveHomeDashboardPath } from "@/constants/dashboardAccess";
import {
  DEPT_HINT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionCookie";

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
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-slate-50 px-6 dark:bg-slate-950">
      <div className="max-w-lg text-center">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Medica
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Operational portals
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Sign in with your departmental account. Middleware routes you into the
          correct workspace once session cookies mirror your Redux session.
        </p>
      </div>
      <Link
        className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 dark:bg-blue-500 dark:shadow-none dark:hover:bg-blue-400"
        href="/login"
      >
        Sign in
      </Link>
    </main>
  );
}
