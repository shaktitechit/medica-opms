"use client";

import Link from "next/link";

export default function OrderTable({
  orders = [],
  emptyHint,
  portal,
}: {
  orders?: unknown[];
  emptyHint?: string;
  portal?: string;
}) {
  if (!orders.length) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {emptyHint || "No orders loaded."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md ring-1 ring-slate-200/90 dark:ring-white/10">
      <table className="min-w-[480px] w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Id</th>
            <th className="px-3 py-2 font-medium">Ref</th>
            <th className="px-3 py-2 font-medium">Status</th>
            {portal && <th className="px-3 py-2 font-medium text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
          {orders.slice(0, 40).map((row, idx) => {
            const o =
              row && typeof row === "object"
                ? (row as Record<string, unknown>)
                : {};
            const oid = o.id ?? o._id ?? String(idx);
            const ref =
              typeof o.order_number === "string"
                ? o.order_number
                : String(o.reference ?? "—");
            const st =
              typeof o.status === "string" ? o.status : String(o.state ?? "—");
            return (
              <tr key={String(oid)} className="bg-white dark:bg-slate-900">
                <td className="max-w-[120px] truncate px-3 py-1.5 font-mono">
                  {String(oid)}
                </td>
                <td className="max-w-[160px] truncate px-3 py-1.5">{ref}</td>
                <td className="px-3 py-1.5 capitalize">{st}</td>
                {portal && (
                  <td className="px-3 py-1.5 text-right">
                    <Link
                      href={`/${portal}/order/${oid}`}
                      className="text-blue-600 underline decoration-blue-600/40 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/40"
                    >
                      View
                    </Link>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

