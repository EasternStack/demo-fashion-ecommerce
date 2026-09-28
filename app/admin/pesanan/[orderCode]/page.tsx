import Link from "next/link";
import { TransitionButtons } from "@/components/admin/transition-buttons";
import { OrderTimeline } from "@/components/storefront/order-timeline";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { allowedTargets } from "@/lib/order-status";
import { getOrderForAdmin } from "@/server/domain/orders";
import { requireAdmin } from "@/server/session";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  await requireAdmin();
  const order = await getOrderForAdmin(orderCode);
  if (!order) return <p className="text-sm">Pesanan tidak ditemukan.</p>;
  return (
    <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div>
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-2xl font-bold">{order.code}</h1>
          <StatusChip status={order.status} />
        </div>
        <ul className="mt-6 flex flex-col gap-2 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between border-b border-olive/10 pb-2">
              <span>{i.productName} — {i.variantLabel} × {i.qty}</span>
              <span>{formatIDR(i.unitPrice * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <TransitionButtons orderCode={order.code} targets={allowedTargets(order.status)} />
        </div>
        <h2 className="mt-8 text-sm font-bold uppercase tracking-widest">Timeline</h2>
        <div className="mt-3">
          <OrderTimeline events={order.events} />
        </div>
      </div>
      <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-olive/10 bg-white p-6 text-sm">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest">Alamat Tujuan</h2>
          <p className="mt-1">{order.shipping.recipient} · {order.shipping.phone}</p>
          <p>{order.shipping.line1}, {order.shipping.city}, {order.shipping.province} {order.shipping.postalCode}</p>
        </div>
        {order.payment && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Pembayaran</h2>
            <p className="mt-1">{order.payment.method} · {order.payment.status}{order.payment.last4 ? ` · •••• ${order.payment.last4}` : ""}</p>
          </div>
        )}
        {order.shipment && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Pengiriman</h2>
            <p className="mt-1">{order.shipment.carrier} · Resi <span className="font-mono">{order.shipment.trackingNumber}</span></p>
          </div>
        )}
        <Link href="/admin/pesanan" className="text-xs underline">← Semua pesanan</Link>
      </aside>
    </div>
  );
}
