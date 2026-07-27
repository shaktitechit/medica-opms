"use client";

import AdminCreateOrderPage from "@/components/portal/admin/AdminCreateOrderPage";

/** Finance create-order uses the shared staff create form. */
export default function FinanceCreateOrderPage() {
  return <AdminCreateOrderPage portalHome="/finance" />;
}
