import Link from "next/link";
import { Suspense } from "react";
import type { Role } from "@prisma/client";
import { ActionButton } from "@/components/admin/action-button";
import { SearchForm } from "@/components/admin/search-form";
import { TablePager } from "@/components/admin/table-pager";
import { formatIDR } from "@/lib/format";
import { parsePage, parseQuery } from "@/lib/pagination";
import { setUserRoleAction, setUserSuspendedAction } from "@/server/actions/admin-users";
import { listUsersForAdmin } from "@/server/domain/admin-users";
import { requireAdmin } from "@/server/session";

const ROLES: (Role | undefined)[] = [undefined, "ADMIN", "CUSTOMER"];
const STATUSES: ("active" | "suspended" | undefined)[] = [undefined, "active", "suspended"];
const ROLE_LABEL: Record<string, string> = { all: "Semua Role", ADMIN: "Admin", CUSTOMER: "Customer" };
const STATUS_LABEL: Record<string, string> = {
  all: "Semua Status",
  active: "Aktif",
  suspended: "Ditangguhkan",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const { q: rawQ, role: rawRole, status: rawStatus, page: rawPage } = await searchParams;
  const session = await requireAdmin();
  const q = parseQuery(rawQ);
  const page = parsePage(rawPage);
  const role = ROLES.includes(rawRole as Role | undefined) ? (rawRole as Role) : undefined;
  const status = STATUSES.includes(rawStatus as "active" | "suspended" | undefined)
    ? (rawStatus as "active" | "suspended")
    : undefined;

  const result = await listUsersForAdmin(session, { q: q || undefined, role, status, page });
  if ("error" in result) return <p className="text-sm">{result.error}</p>;
  const { rows, total } = result;

  const hrefFor = (nextRole: Role | undefined, nextStatus: string | undefined) => {
    const params = new URLSearchParams();
    if (nextRole) params.set("role", nextRole);
    if (nextStatus) params.set("status", nextStatus);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin/pengguna?${qs}` : "/admin/pengguna";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Pengguna</h1>
        <Suspense fallback={null}>
          <SearchForm placeholder="Cari nama atau email…" />
        </Suspense>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
        {ROLES.map((r) => (
          <Link
            key={r ?? "all"}
            href={hrefFor(r, status)}
            className={`rounded-full px-3 py-1 ${role === r ? "bg-olive text-lime" : "border border-olive/20"}`}
          >
            {ROLE_LABEL[r ?? "all"]}
          </Link>
        ))}
        <span className="opacity-30">|</span>
        {STATUSES.map((s) => (
          <Link
            key={s ?? "all"}
            href={hrefFor(role, s)}
            className={`rounded-full px-3 py-1 ${status === s ? "bg-olive text-lime" : "border border-olive/20"}`}
          >
            {STATUS_LABEL[s ?? "all"]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-olive/20 p-10 text-center text-sm opacity-60">
          {q || role || status ? "Tidak ada pengguna yang cocok dengan filter ini." : "Belum ada pengguna."}
        </p>
      ) : (
        <>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-olive/15 text-left text-xs uppercase tracking-widest opacity-70">
                <th className="py-2">Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Pesanan</th>
                <th>Total Belanja</th>
                <th>Daftar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.id === session.userId;
                return (
                  <tr key={u.id} className="border-b border-olive/10">
                    <td className="py-2">
                      <Link href={`/admin/pengguna/${u.id}`} className="font-semibold underline">
                        {u.name}
                      </Link>
                      {isSelf && <span className="ml-2 text-xs opacity-50">(kamu)</span>}
                    </td>
                    <td className="opacity-80">{u.email}</td>
                    <td>{u.role === "ADMIN" ? "Admin" : "Customer"}</td>
                    <td>
                      {u.suspendedAt ? (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900">
                          Ditangguhkan
                        </span>
                      ) : (
                        <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-olive">
                          Aktif
                        </span>
                      )}
                    </td>
                    <td>{u.orderCount}</td>
                    <td>{formatIDR(u.totalSpent)}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString("id-ID")}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <ActionButton
                          action={setUserRoleAction.bind(null, u.id, u.role === "ADMIN" ? "CUSTOMER" : "ADMIN")}
                          label={u.role === "ADMIN" ? "Demote" : "Promote"}
                          confirm={
                            u.role === "ADMIN"
                              ? `Turunkan ${u.name} menjadi customer?`
                              : `Naikkan ${u.name} menjadi admin?`
                          }
                        />
                        <ActionButton
                          action={setUserSuspendedAction.bind(null, u.id, !u.suspendedAt)}
                          label={u.suspendedAt ? "Aktifkan" : "Tangguhkan"}
                          confirm={u.suspendedAt ? `Aktifkan kembali ${u.name}?` : `Tangguhkan ${u.name}?`}
                          variant={u.suspendedAt ? "plain" : "danger"}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePager total={total} page={page} searchParams={{ q: q || undefined, role, status }} />
        </>
      )}
    </div>
  );
}
