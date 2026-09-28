import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { setUserRoleAction, setUserSuspendedAction } from "@/server/actions/admin-users";
import { getUserForAdmin } from "@/server/domain/admin-users";
import { requireAdmin } from "@/server/session";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAdmin();
  const user = await getUserForAdmin(id, session);
  if (user === null) notFound();
  if ("error" in user) return <p className="text-sm">{user.error}</p>;

  const isSelf = user.id === session.userId;
  const average = user.orderCount === 0 ? 0 : Math.round(user.totalSpent / user.orderCount);
  const roleBadge =
    user.role === "ADMIN" ? "bg-olive text-lime" : "border border-olive/20 text-olive";

  return (
    <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">{user.name}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${roleBadge}`}>
            {user.role === "ADMIN" ? "Admin" : "Customer"}
          </span>
          {user.suspendedAt ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900">
              Ditangguhkan
            </span>
          ) : (
            <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-olive">Aktif</span>
          )}
          {isSelf && <span className="text-xs opacity-50">(akun kamu sendiri)</span>}
        </div>
        <p className="mt-1 text-sm opacity-70">
          {user.email} · terdaftar {new Date(user.createdAt).toLocaleDateString("id-ID")}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs uppercase tracking-widest opacity-60">Pesanan</p>
            <p className="text-2xl font-extrabold">{user.orderCount}</p>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs uppercase tracking-widest opacity-60">Total Belanja</p>
            <p className="text-2xl font-extrabold">{formatIDR(user.totalSpent)}</p>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs uppercase tracking-widest opacity-60">Rata-rata</p>
            <p className="text-2xl font-extrabold">
              {user.orderCount === 0 ? "—" : formatIDR(average)}
            </p>
          </div>
        </div>

        <h2 className="mt-8 text-sm font-bold uppercase tracking-widest">Riwayat Pesanan</h2>
        {user.orders.length === 0 ? (
          <p className="mt-3 text-sm opacity-60">Belum ada pesanan.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {user.orders.map((o) => (
              <li key={o.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-olive/10 pb-2">
                <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">
                  {o.code}
                </Link>
                <span className="opacity-70">{new Date(o.createdAt).toLocaleDateString("id-ID")}</span>
                <span>{formatIDR(o.total)}</span>
                <StatusChip status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="flex h-fit flex-col gap-6 rounded-2xl border border-olive/10 bg-white p-6 text-sm">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest">Aksi Admin</h2>
          <div className="mt-3 flex flex-col items-start gap-2">
            <ActionButton
              action={setUserRoleAction.bind(null, user.id, user.role === "ADMIN" ? "CUSTOMER" : "ADMIN")}
              label={user.role === "ADMIN" ? "Turunkan jadi Customer" : "Naikkan jadi Admin"}
              confirm={
                user.role === "ADMIN"
                  ? `Turunkan ${user.name} menjadi customer?`
                  : `Naikkan ${user.name} menjadi admin?`
              }
            />
            <ActionButton
              action={setUserSuspendedAction.bind(null, user.id, !user.suspendedAt)}
              label={user.suspendedAt ? "Aktifkan Kembali" : "Tangguhkan Akun"}
              confirm={user.suspendedAt ? `Aktifkan kembali ${user.name}?` : `Tangguhkan ${user.name}?`}
              variant={user.suspendedAt ? "plain" : "danger"}
            />
          </div>
          {isSelf && (
            <p className="mt-2 text-xs opacity-60">
              Aksi role dan suspensi akan ditolak server untuk akun sendiri.
            </p>
          )}
          <div className="mt-4">
            <ResetPasswordForm userId={user.id} />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest">Alamat Tersimpan</h2>
          {user.addresses.length === 0 ? (
            <p className="mt-2 text-xs opacity-60">Belum ada alamat.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3 text-xs">
              {user.addresses.map((a, i) => (
                <li key={i} className="border-b border-olive/10 pb-2">
                  <p className="font-semibold">
                    {a.recipient} · {a.phone}
                  </p>
                  <p className="opacity-70">
                    {a.line1}, {a.city}, {a.province} {a.postalCode}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link href="/admin/pengguna" className="text-xs underline">
          ← Semua pengguna
        </Link>
      </aside>
    </div>
  );
}
