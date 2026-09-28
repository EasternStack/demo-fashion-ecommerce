import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/action-button";
import { SearchForm } from "@/components/admin/search-form";
import { TablePager } from "@/components/admin/table-pager";
import { formatIDR } from "@/lib/format";
import { parsePage, parseQuery } from "@/lib/pagination";
import { toggleProductActiveAction } from "@/server/actions/admin";
import { listProductsForAdmin } from "@/server/domain/admin-catalog";
import { requireAdmin } from "@/server/session";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const session = await requireAdmin();
  const q = parseQuery(rawQ);
  const page = parsePage(rawPage);
  const result = await listProductsForAdmin(session, { q: q || undefined, page });
  if ("error" in result) return <p className="text-sm">{result.error}</p>;
  const { rows, total } = result;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Produk &amp; Stok</h1>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <SearchForm placeholder="Cari nama atau slug…" />
          </Suspense>
          <Link
            href="/admin/produk/baru"
            className="rounded-full bg-lime px-4 py-2 text-sm font-semibold uppercase tracking-widest"
          >
            Produk Baru
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-olive/20 p-10 text-center text-sm opacity-60">
          {q ? `Tidak ada produk yang cocok dengan "${q}".` : "Belum ada produk."}
        </p>
      ) : (
        <>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-olive/15 text-left text-xs uppercase tracking-widest opacity-70">
                <th className="py-2">Nama</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Total Stok</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-olive/10">
                  <td className="py-2 font-semibold">{r.name}</td>
                  <td>{r.categoryName}</td>
                  <td>{formatIDR(r.basePrice)}</td>
                  <td>{r.totalStock}</td>
                  <td>{r.isActive ? "Aktif" : "Nonaktif"}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/produk/${r.id}/edit`} className="text-xs font-semibold underline">
                        Edit
                      </Link>
                      <ActionButton
                        action={toggleProductActiveAction.bind(null, r.id)}
                        label={r.isActive ? "Nonaktifkan" : "Aktifkan"}
                        confirm={r.isActive ? `Nonaktifkan ${r.name}?` : `Aktifkan ${r.name}?`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager total={total} page={page} searchParams={{ q: q || undefined }} />
        </>
      )}
    </div>
  );
}
