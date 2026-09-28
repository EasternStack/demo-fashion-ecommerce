import type { OrderStatus, Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertRole, hashPassword, type Session } from "@/server/session";
import type { Result } from "@/server/domain/cart";
import { PAGE_SIZE, parseQuery, type ListResult } from "@/lib/pagination";
import { listOrdersForUser, type AddressInput, type OrderSummary } from "@/server/domain/orders";

async function countOtherActiveAdmins(excludeId: string): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", suspendedAt: null, id: { not: excludeId } },
  });
}

export async function setUserRole(
  targetId: string,
  role: Role,
  actor: Session | null,
): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  if (
    target.role === "ADMIN" &&
    role !== "ADMIN" &&
    (await countOtherActiveAdmins(targetId)) === 0
  ) {
    return { error: "Admin terakhir tidak bisa dilucuti." };
  }
  if (targetId === actor!.userId) return { error: "Tidak bisa mengubah akun sendiri." };
  await prisma.user.update({ where: { id: targetId }, data: { role } });
  return { ok: true };
}

export async function setUserSuspended(
  targetId: string,
  suspended: boolean,
  actor: Session | null,
): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  const wouldStripLastAdmin =
    suspended &&
    target.suspendedAt === null &&
    target.role === "ADMIN" &&
    (await countOtherActiveAdmins(targetId)) === 0;
  if (wouldStripLastAdmin) return { error: "Admin terakhir tidak bisa ditangguhkan." };
  if (targetId === actor!.userId) return { error: "Tidak bisa mengubah akun sendiri." };
  await prisma.user.update({
    where: { id: targetId },
    data: { suspendedAt: suspended ? new Date() : null },
  });
  return { ok: true };
}

export async function resetUserPassword(
  targetId: string,
  password: string,
  actor: Session | null,
): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash: await hashPassword(password) },
  });
  return { ok: true };
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  suspendedAt: Date | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
};

export type AdminUserDetail = AdminUserRow & {
  addresses: AddressInput[];
  orders: OrderSummary[];
};

export type AdminUserQuery = {
  q?: string;
  role?: Role;
  status?: "active" | "suspended";
  page?: number;
};

const SPENT_STATUSES = { notIn: ["PENDING", "CANCELLED"] as OrderStatus[] };

export async function listUsersForAdmin(
  actor: Session | null,
  query: AdminUserQuery = {},
): Promise<ListResult<AdminUserRow> | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const page = Math.max(1, query.page ?? 1);
  const q = parseQuery(query.q);
  const where: Prisma.UserWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status === "active" ? { suspendedAt: null } : {}),
    ...(query.status === "suspended" ? { suspendedAt: { not: null } } : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const spend = await prisma.order.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, status: SPENT_STATUSES },
    _count: { _all: true },
    _sum: { total: true },
  });
  const byUser = new Map(spend.map((s) => [s.userId, s]));
  return {
    total,
    rows: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      suspendedAt: u.suspendedAt,
      createdAt: u.createdAt,
      orderCount: byUser.get(u.id)?._count?._all ?? 0,
      totalSpent: byUser.get(u.id)?._sum?.total ?? 0,
    })),
  };
}

export async function getUserForAdmin(
  targetId: string,
  actor: Session | null,
): Promise<AdminUserDetail | null | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const user = await prisma.user.findUnique({ where: { id: targetId }, include: { addresses: true } });
  if (!user) return null;
  const [agg, orders] = await Promise.all([
    prisma.order.aggregate({
      where: { userId: targetId, status: SPENT_STATUSES },
      _count: { _all: true },
      _sum: { total: true },
    }),
    listOrdersForUser(targetId),
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    suspendedAt: user.suspendedAt,
    createdAt: user.createdAt,
    orderCount: agg._count?._all ?? 0,
    totalSpent: agg._sum?.total ?? 0,
    addresses: user.addresses.map((a) => ({
      recipient: a.recipient,
      phone: a.phone,
      line1: a.line1,
      city: a.city,
      province: a.province,
      postalCode: a.postalCode,
    })),
    orders,
  };
}
