"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/pesanan", label: "Pesanan" },
  { href: "/admin/produk", label: "Produk & Stok" },
  { href: "/admin/pengguna", label: "Pengguna" },
];

const CRUMB: Record<string, string> = {
  admin: "Admin",
  pesanan: "Pesanan",
  produk: "Produk & Stok",
  pengguna: "Pengguna",
  baru: "Baru",
  edit: "Edit",
};

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  adminName,
  adminEmail,
  children,
}: {
  adminName: string;
  adminEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col bg-cream md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 overflow-x-auto bg-olive px-4 py-4 text-cream md:w-56 md:overflow-visible md:py-6">
        <p className="mb-3 hidden px-3 text-xs font-bold uppercase tracking-widest text-lime md:block">
          Easternstack <span className="font-light text-cream">Admin</span>
        </p>
        <nav className="flex gap-1 md:flex-col">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${
                  active ? "bg-lime text-olive" : "opacity-70 hover:bg-white/10 hover:opacity-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/"
          className="mt-auto whitespace-nowrap rounded-full px-3 py-2 text-sm opacity-50 hover:opacity-100"
        >
          &larr; Toko
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-olive/10 px-6 py-4">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest"
          >
            {segments.map((segment, i) => {
              const href = `/${segments.slice(0, i + 1).join("/")}`;
              const label = CRUMB[segment] ?? segment;
              const last = i === segments.length - 1;
              return (
                <span key={href} className="flex items-center gap-2">
                  {i > 0 && <span className="opacity-30">/</span>}
                  {last ? (
                    <span className="opacity-90">{label}</span>
                  ) : (
                    <Link href={href} className="opacity-50 hover:opacity-100">
                      {label}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs">
              <p className="font-bold">{adminName}</p>
              <p className="opacity-60">{adminEmail}</p>
            </div>
            <form action={logoutAction}>
              <button className="rounded-full border border-olive/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest hover:bg-lime">
                Keluar
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
