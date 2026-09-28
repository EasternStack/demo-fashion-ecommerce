import Link from "next/link";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { listOrdersForUser } from "@/server/domain/orders";
import { requireUser } from "@/server/session";

export default async function MyOrdersPage() {
  const session = await requireUser();
  const orders = await listOrdersForUser(session.userId);
  return (
    <div>
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Pesanan Saya</h1>
      {orders.length === 0 ? (
        <p className="mt-6 text-sm">Belum ada pesanan.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.code}>
              <Link href={`/akun/pesanan/${o.code}`} className="flex items-center justify-between gap-4 rounded-2xl border border-olive/10 bg-white px-5 py-4">
                <div>
                  <p className="font-mono text-sm font-semibold">{o.code}</p>
                  <p className="text-xs opacity-70">
                    {new Date(o.createdAt).toLocaleDateString("id-ID")} · {o.itemCount} item
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusChip status={o.status} />
                  <span className="text-sm font-bold">{formatIDR(o.total)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
