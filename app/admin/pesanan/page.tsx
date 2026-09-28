import Link from "next/link";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { listOrdersForAdmin } from "@/server/domain/orders";
import { requireAdmin } from "@/server/session";
import type { OrderStatus } from "@prisma/client";

const TABS: (OrderStatus | undefined)[] = [undefined, "PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  await requireAdmin();
  const filter = TABS.includes(status as OrderStatus | undefined) ? (status as OrderStatus) : undefined;
  const orders = await listOrdersForAdmin(filter);
  return (
    <div>
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Pesanan</h1>
      <nav className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-widest">
        {TABS.map((t) => (
          <Link key={t ?? "all"} href={t ? `/admin/pesanan?status=${t}` : "/admin/pesanan"}
            className={`rounded-full px-3 py-1 ${filter === t ? "bg-olive text-lime" : "border border-olive/20"}`}>
            {t ?? "Semua"}
          </Link>
        ))}
      </nav>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-olive/15 text-left text-xs uppercase tracking-widest opacity-70">
            <th className="py-2">Kode</th>
            <th>Customer</th>
            <th>Tanggal</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.code} className="border-b border-olive/10">
              <td className="py-2">
                <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">{o.code}</Link>
              </td>
              <td>{o.customerName}</td>
              <td>{new Date(o.createdAt).toLocaleDateString("id-ID")}</td>
              <td>{formatIDR(o.total)}</td>
              <td><StatusChip status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
