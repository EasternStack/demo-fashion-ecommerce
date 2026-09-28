import Link from "next/link";
import { formatIDR } from "@/lib/format";
import { listProductsForAdmin } from "@/server/domain/admin-catalog";
import { requireAdmin } from "@/server/session";
import { ToggleActiveButton } from "@/components/admin/toggle-active-button";

export default async function AdminProductsPage() {
  const session = await requireAdmin();
  const rows = await listProductsForAdmin(session);
  if ("error" in rows) return <p>{rows.error}</p>;
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Produk &amp; Stok</h1>
        <Link href="/admin/produk/baru" className="rounded-full bg-lime px-4 py-2 text-sm font-semibold uppercase tracking-widest">
          Produk Baru
        </Link>
      </div>
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
              <td className="flex gap-2 py-2">
                <Link href={`/admin/produk/${r.id}/edit`} className="underline">Edit</Link>
                <ToggleActiveButton productId={r.id} isActive={r.isActive} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
