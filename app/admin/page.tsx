import Link from "next/link";
import type { Period } from "@/server/domain/admin-analytics";
import { KpiCard } from "@/components/admin/kpi-card";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { StatusDonut } from "@/components/admin/status-donut";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { getDashboardMetrics, parsePeriod } from "@/server/domain/admin-analytics";
import { requireAdmin } from "@/server/session";

const PERIODS: Period[] = [7, 30, 90];

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-olive/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest opacity-60">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm opacity-50">{text}</p>;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const { periode } = await searchParams;
  const session = await requireAdmin();
  const period = parsePeriod(periode);
  const result = await getDashboardMetrics(session, period);
  if ("error" in result) return <p className="text-sm">{result.error}</p>;
  const m = result;
  const maxQty = Math.max(1, ...m.topProducts.map((p) => p.qty));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Dashboard</h1>
        <nav className="flex gap-2 text-xs font-semibold uppercase tracking-widest">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={p === 30 ? "/admin" : `/admin?periode=${p}`}
              className={`rounded-full px-3 py-1 ${period === p ? "bg-olive text-lime" : "border border-olive/20"}`}
            >
              {p} hari
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={`Revenue ${period} hari`} value={m.revenue.value} previous={m.revenue.previous} format="idr" />
        <KpiCard label="Pesanan dibayar" value={m.paidOrders.value} previous={m.paidOrders.previous} format="count" />
        <KpiCard label="Rata-rata pesanan" value={m.aov} format="idr" />
        <KpiCard label="User baru" value={m.newUsers.value} previous={m.newUsers.previous} format="count" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel title={`Revenue harian · ${period} hari`}>
          <RevenueChart data={m.dailyRevenue} />
        </Panel>
        <Panel title="Status pesanan · seluruh waktu">
          <StatusDonut data={m.statusCounts} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Produk terlaris">
          {m.topProducts.length === 0 ? (
            <Empty text="Belum ada penjualan." />
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {m.topProducts.map((p) => (
                <li key={p.productName}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{p.productName}</span>
                    <span className="opacity-60">{p.qty} terjual</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-cream">
                    <div
                      className="h-2 rounded-full bg-lime"
                      style={{ width: `${Math.round((p.qty / maxQty) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={`Stok menipis · ≤ ${LOW_STOCK_THRESHOLD}`}
          action={
            <Link href="/admin/produk" className="text-xs font-semibold uppercase tracking-widest underline">
              Kelola
            </Link>
          }
        >
          {m.lowStock.length === 0 ? (
            <Empty text="Semua stok aman." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {m.lowStock.map((v, i) => (
                <li key={i} className="flex items-center justify-between border-b border-olive/10 pb-2">
                  <span>
                    <span className="font-semibold">{v.productName}</span>
                    <span className="ml-2 text-xs opacity-60">{v.variantLabel}</span>
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${v.stock === 0 ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
                    {v.stock === 0 ? "Habis" : `Sisa ${v.stock}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Pesanan terbaru"
        action={
          <Link href="/admin/pesanan" className="text-xs font-semibold uppercase tracking-widest underline">
            Semua
          </Link>
        }
      >
        {m.recentOrders.length === 0 ? (
          <Empty text="Belum ada pesanan." />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {m.recentOrders.map((o) => (
                <tr key={o.code} className="border-b border-olive/10">
                  <td className="py-2">
                    <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">
                      {o.code}
                    </Link>
                  </td>
                  <td className="opacity-80">{o.customerName}</td>
                  <td className="opacity-60">{new Date(o.createdAt).toLocaleDateString("id-ID")}</td>
                  <td>{formatIDR(o.total)}</td>
                  <td><StatusChip status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
