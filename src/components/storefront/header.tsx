import Link from "next/link";
import { listCategories } from "@/server/domain/catalog";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { logoutAction } from "@/server/actions/auth";

async function cartCount(userId: string | undefined) {
  if (!userId) return 0;
  const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  return cart?.items.reduce((s, i) => s + i.qty, 0) ?? 0;
}

export async function Header() {
  const [session, categories] = await Promise.all([getCurrentSession(), listCategories()]);
  const count = await cartCount(session?.userId);
  return (
    <header className="border-b border-olive/10 bg-cream">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
        <Link href="/" className="text-xl font-extrabold uppercase tracking-tight">
          Easternstack<span className="font-light"> Store</span>
        </Link>
        <form action="/cari" className="flex-1">
          <input
            name="q"
            placeholder="Cari produk…"
            className="w-full rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none"
          />
        </form>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/cart" className="relative">
            Tas
            {count > 0 && (
              <span className="absolute -right-3 -top-2 rounded-full bg-lime px-1.5 text-xs font-bold">{count}</span>
            )}
          </Link>
          {session ? (
            <>
              <Link href="/akun/pesanan">Pesanan Saya</Link>
              {session.role === "ADMIN" && <Link href="/admin">Admin</Link>}
              <form action={logoutAction}>
                <button className="underline">Keluar</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Masuk</Link>
              <Link href="/register" className="rounded-full border border-olive px-3 py-1 font-semibold hover:bg-lime">
                Daftar
              </Link>
            </>
          )}
        </nav>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 pb-3 text-xs font-semibold uppercase tracking-widest">
        <Link href="/">Semua Kategori</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/kategori/${c.slug}`}>
            {c.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
