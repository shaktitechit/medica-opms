"use client";

import AdminCreateOrderPage from "@/components/portal/admin/AdminCreateOrderPage";

/** Account create-order uses the shared staff create form. */
export default function AccountCreateOrderPage() {
  return <AdminCreateOrderPage portalHome="/account" />;
}
