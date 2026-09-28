import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

const TONES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  PAID: "bg-lime text-olive",
  PROCESSING: "bg-sky-100 text-sky-900",
  SHIPPED: "bg-violet-100 text-violet-900",
  DELIVERED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-red-100 text-red-900",
};

export function StatusChip({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
