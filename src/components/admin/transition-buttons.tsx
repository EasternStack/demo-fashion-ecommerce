"use client";

import type { OrderStatus } from "@prisma/client";
import { adminOrderTransitionAction } from "@/server/actions/admin";
import { ActionButton } from "./action-button";

const LABELS: Partial<Record<OrderStatus, string>> = {
  PROCESSING: "Mulai Proses",
  SHIPPED: "Kirim Paket",
  DELIVERED: "Tandai Diterima",
  CANCELLED: "Batalkan Pesanan",
};

export function TransitionButtons({ orderCode, targets }: { orderCode: string; targets: OrderStatus[] }) {
  const actionable = targets.filter((t) => t !== "PAID");
  if (actionable.length === 0) return <p className="text-xs opacity-60">Tidak ada aksi tersedia.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {actionable.map((t) => (
        <ActionButton
          key={t}
          action={() => adminOrderTransitionAction(orderCode, t)}
          label={LABELS[t] ?? t}
          confirm={`Ubah status pesanan menjadi ${t}?`}
          variant={t === "CANCELLED" ? "danger" : "plain"}
        />
      ))}
    </div>
  );
}
