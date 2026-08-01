"use client";

import { useRouter } from "next/navigation";
import SuperAdminCreateOrderForm from "@/components/portal/super_admin/order/SuperAdminCreateOrderForm";

export default function SuperAdminCreateOrderPage() {
  const router = useRouter();

  const handleClose = () => {
    router.push("/super_admin/orders");
  };

  return (
    <SuperAdminCreateOrderForm
      isOpen={true}
      onClose={handleClose}
      onOrderCreated={() => {}}
    />
  );
}
