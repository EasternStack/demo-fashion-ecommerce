import type { OrderStatus } from "@prisma/client";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { prisma } from "@/server/db";
import { listOrdersForAdmin, type OrderSummary } from "@/server/domain/orders";
import { assertRole, type Session } from "@/server/session";

export type Period = 7 | 30 | 90;
export type Metric = { value: number; previous: number };
export type BucketInput = { createdAt: Date; total: number; status: OrderStatus };

export type DashboardMetrics = {
  period: Period;
  revenue: Metric;
  paidOrders: Metric;
  newUsers: Metric;
  aov: number;
  dailyRevenue: { date: string; total: number }[];
  statusCounts: { status: OrderStatus; count: number }[];
  topProducts: { productName: string; qty: number }[];
  lowStock: { productName: string; variantLabel: string; stock: number }[];
  recentOrders: OrderSummary[];
};

const EXCLUDED: OrderStatus[] = ["PENDING", "CANCELLED"];

export function parsePeriod(raw: string | undefined): Period {
  const n = Number.parseInt(raw ?? "", 10);
  return n === 7 || n === 30 || n === 90 ? n : 30;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDayDaysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export function bucketDaily(
  orders: BucketInput[],
  from: Date,
  to: Date,
): { date: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const o of orders) {
    if (o.createdAt < from || o.createdAt >= to) continue;
    if (EXCLUDED.includes(o.status)) continue;
    const key = dayKey(o.createdAt);
    totals.set(key, (totals.get(key) ?? 0) + o.total);
  }
  const out: { date: string; total: number }[] = [];
  const cursor = new Date(from);
  while (cursor < to) {
    const key = dayKey(cursor);
    out.push({ date: key, total: totals.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export async function getDashboardMetrics(
  actor: Session | null,
  period: Period = 30,
): Promise<DashboardMetrics | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }

  const to = new Date();
  const currentFrom = startOfDayDaysAgo(to, period - 1);
  const previousFrom = startOfDayDaysAgo(to, period * 2 - 1);

  const [orders, statusGroups, topGroups, lowStock, newUsersCurrent, newUsersPrevious, recent] =
    await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: previousFrom, lt: to } },
        select: { createdAt: true, total: true, status: true },
      }),
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.orderItem.groupBy({
        by: ["productName"],
        where: { order: { status: { notIn: EXCLUDED } } },
        _sum: { qty: true },
        orderBy: { _sum: { qty: "desc" } },
        take: 5,
      }),
      prisma.productVariant.findMany({
        where: { stock: { lte: LOW_STOCK_THRESHOLD }, product: { isActive: true } },
        include: { product: { select: { name: true } } },
        orderBy: { stock: "asc" },
        take: 8,
      }),
      prisma.user.count({ where: { createdAt: { gte: currentFrom, lt: to } } }),
      prisma.user.count({ where: { createdAt: { gte: previousFrom, lt: currentFrom } } }),
      listOrdersForAdmin({ take: 6 }),
    ]);

  const paid = orders.filter((o) => !EXCLUDED.includes(o.status));
  const inWindow = (list: typeof paid, from: Date, limit: Date) =>
    list.filter((o) => o.createdAt >= from && o.createdAt < limit);
  const sumOf = (list: typeof paid) => list.reduce((s, o) => s + o.total, 0);

  const paidCurrent = inWindow(paid, currentFrom, to);
  const paidPrevious = inWindow(paid, previousFrom, currentFrom);
  const revenueValue = sumOf(paidCurrent);

  return {
    period,
    revenue: { value: revenueValue, previous: sumOf(paidPrevious) },
    paidOrders: { value: paidCurrent.length, previous: paidPrevious.length },
    newUsers: { value: newUsersCurrent, previous: newUsersPrevious },
    aov: paidCurrent.length === 0 ? 0 : Math.round(revenueValue / paidCurrent.length),
    dailyRevenue: bucketDaily(orders, currentFrom, to),
    statusCounts: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    topProducts: topGroups.map((g) => ({ productName: g.productName, qty: g._sum.qty ?? 0 })),
    lowStock: lowStock.map((v) => ({
      productName: v.product.name,
      variantLabel: `${v.colorName} / ${v.size}`,
      stock: v.stock,
    })),
    recentOrders: recent.rows,
  };
}
