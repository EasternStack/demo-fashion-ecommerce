"use client";

import { useTransition } from "react";
import type { OrderStatus } from "@prisma/client";
import { adminOrderTransitionAction } from "@/server/actions/admin";

const LABELS: Partial<Record<OrderStatus, string>> = {
  PROCESSING: "Mulai Proses",
  SHIPPED: "Kirim Paket",
  DELIVERED: "Tandai Diterima",
  CANCELLED: "Batalkan Pesanan",
};

export function TransitionButtons({ orderCode, targets }: { orderCode: string; targets: OrderStatus[] }) {
  const [pending, start] = useTransition();
  const actionable = targets.filter((t) => t !== "PAID");
  if (actionable.length === 0) return <p className="text-xs opacity-60">Tidak ada aksi tersedia.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {actionable.map((t) => (
        <button
          key={t}
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Ubah status pesanan menjadi ${t}?`)) return;
            start(async () => { await adminOrderTransitionAction(orderCode, t); });
          }}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest ${
            t === "CANCELLED" ? "border border-red-700 text-red-700" : "bg-lime"
          }`}
        >
          {LABELS[t] ?? t}
        </button>
      ))}
    </div>
  );
}
