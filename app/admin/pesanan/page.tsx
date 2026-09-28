import Link from "next/link";
import { Suspense } from "react";
import type { OrderStatus } from "@prisma/client";
import { SearchForm } from "@/components/admin/search-form";
import { TablePager } from "@/components/admin/table-pager";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { parsePage, parseQuery } from "@/lib/pagination";
import { listOrdersForAdmin } from "@/server/domain/orders";
import { requireAdmin } from "@/server/session";

const TABS: (OrderStatus | undefined)[] = [
  undefined, "PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED",
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { status, q: rawQ, page: rawPage } = await searchParams;
  await requireAdmin();
  const filter = TABS.includes(status as OrderStatus | undefined) ? (status as OrderStatus) : undefined;
  const q = parseQuery(rawQ);
  const page = parsePage(rawPage);
  const { rows, total } = await listOrdersForAdmin({ status: filter, q: q || undefined, page });

  const hrefFor = (tab: OrderStatus | undefined) => {
    const params = new URLSearchParams();
    if (tab) params.set("status", tab);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin/pesanan?${qs}` : "/admin/pesanan";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Pesanan</h1>
        <Suspense fallback={null}>
          <SearchForm placeholder="Cari kode, penerima, atau pembeli…" />
        </Suspense>
      </div>

      <nav className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-widest">
        {TABS.map((t) => (
          <Link
            key={t ?? "all"}
            href={hrefFor(t)}
            className={`rounded-full px-3 py-1 ${filter === t ? "bg-olive text-lime" : "border border-olive/20"}`}
          >
            {t ?? "Semua"}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-olive/20 p-10 text-center text-sm opacity-60">
          {q || filter ? "Tidak ada pesanan yang cocok dengan filter ini." : "Belum ada pesanan."}
        </p>
      ) : (
        <>
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
              {rows.map((o) => (
                <tr key={o.code} className="border-b border-olive/10">
                  <td className="py-2">
                    <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">
                      {o.code}
                    </Link>
                  </td>
                  <td>{o.customerName}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString("id-ID")}</td>
                  <td>{formatIDR(o.total)}</td>
                  <td><StatusChip status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager total={total} page={page} searchParams={{ status: filter, q: q || undefined }} />
        </>
      )}
    </div>
  );
}
