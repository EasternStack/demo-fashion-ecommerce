import Link from "next/link";
import { requireAdmin } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl gap-8 px-4 py-8">
      <aside className="w-48 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest opacity-60">Admin</p>
        <nav className="mt-2 flex flex-col gap-2 text-sm font-semibold">
          <Link href="/admin/produk" className="rounded-full px-3 py-1 hover:bg-lime">Produk & Stok</Link>
          <Link href="/admin/pesanan" className="rounded-full px-3 py-1 hover:bg-lime">Pesanan</Link>
          <Link href="/" className="rounded-full px-3 py-1 opacity-60 hover:bg-lime">&larr; Toko</Link>
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
