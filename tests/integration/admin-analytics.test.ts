import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getDashboardMetrics, type DashboardMetrics } from "@/server/domain/admin-analytics";
import { addToCart } from "@/server/domain/cart";
import { createOrderFromCart, transitionOrder } from "@/server/domain/orders";
import type { Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

const ADDRESS = {
  recipient: "Penerima Uji",
  phone: "08123456789",
  line1: "Jl. Uji No. 1",
  city: "Jakarta",
  province: "DKI Jakarta",
  postalCode: "10110",
};

let admin: Session;

beforeEach(async () => {
  await cleanDb();
  const user = await makeUser("ADMIN");
  admin = { userId: user.id, role: "ADMIN" };
});

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

async function placeOrder(daysBack: number, status: "PAID" | "CANCELLED" | "PENDING") {
  const buyer = await makeUser();
  const cat = await makeCategory();
  const product = await makeProduct(cat.id, { stock: 20, basePrice: 100000 });
  await addToCart(buyer.id, product.variants[0].id, 1);
  const created = (await createOrderFromCart(buyer.id, ADDRESS)) as { ok: true; orderCode: string };
  const order = await prisma.order.findUniqueOrThrow({ where: { code: created.orderCode } });
  if (status !== "PENDING") await transitionOrder(order.id, status);
  await prisma.order.update({ where: { id: order.id }, data: { createdAt: daysAgo(daysBack) } });
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

async function metrics(period: 7 | 30 | 90 = 7): Promise<DashboardMetrics> {
  const result = await getDashboardMetrics(admin, period);
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("getDashboardMetrics", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(getDashboardMetrics(actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("mengembalikan nol di semua metrik untuk DB kosong tanpa crash", async () => {
    const m = await metrics(7);
    expect(m.revenue).toEqual({ value: 0, previous: 0 });
    expect(m.paidOrders).toEqual({ value: 0, previous: 0 });
    expect(m.newUsers).toEqual({ value: 1, previous: 0 });
    expect(m.aov).toBe(0);
    expect(m.statusCounts).toEqual([]);
    expect(m.topProducts).toEqual([]);
    expect(m.lowStock).toEqual([]);
    expect(m.recentOrders).toEqual([]);
    expect(m.dailyRevenue).toHaveLength(7);
    expect(m.dailyRevenue.every((d) => d.total === 0)).toBe(true);
  });

  it("menghitung revenue hanya dari pesanan yang dibayar", async () => {
    const paid = await placeOrder(1, "PAID");
    await placeOrder(1, "CANCELLED");
    await placeOrder(1, "PENDING");
    const m = await metrics(7);
    expect(m.revenue.value).toBe(paid.total);
    expect(m.paidOrders.value).toBe(1);
    expect(m.aov).toBe(paid.total);
  });

  it("memisahkan periode saat ini dan periode sebelumnya", async () => {
    const now = await placeOrder(1, "PAID");
    const before = await placeOrder(10, "PAID");
    const m = await metrics(7);
    expect(m.revenue.value).toBe(now.total);
    expect(m.revenue.previous).toBe(before.total);
    expect(m.paidOrders.value).toBe(1);
    expect(m.paidOrders.previous).toBe(1);
  });

  it("menghasilkan satu bucket per hari untuk periode yang diminta", async () => {
    await placeOrder(2, "PAID");
    const m = await metrics(30);
    expect(m.dailyRevenue).toHaveLength(30);
    expect(m.dailyRevenue.filter((d) => d.total > 0)).toHaveLength(1);
  });

  it("menghitung distribusi status seluruh waktu", async () => {
    await placeOrder(1, "PAID");
    await placeOrder(2, "CANCELLED");
    const m = await metrics(7);
    const byStatus = Object.fromEntries(m.statusCounts.map((s) => [s.status, s.count]));
    expect(byStatus.PAID).toBe(1);
    expect(byStatus.CANCELLED).toBe(1);
  });

  it("mengecualikan pesanan batal dari top produk", async () => {
    await placeOrder(1, "CANCELLED");
    const m = await metrics(7);
    expect(m.topProducts).toEqual([]);
  });

  it("menyertakan produk terlaris dari pesanan yang dibayar", async () => {
    await placeOrder(1, "PAID");
    const m = await metrics(7);
    expect(m.topProducts).toHaveLength(1);
    expect(m.topProducts[0].qty).toBe(1);
  });

  it("menandai stok menipis hanya untuk produk aktif", async () => {
    const cat = await makeCategory();
    await makeProduct(cat.id, { stock: 2, isActive: true });
    await makeProduct(cat.id, { stock: 1, isActive: false });
    await makeProduct(cat.id, { stock: 40, isActive: true });
    const m = await metrics(7);
    expect(m.lowStock).toHaveLength(1);
    expect(m.lowStock[0].stock).toBe(2);
    expect(m.lowStock[0].variantLabel).toBe("Hitam / M");
  });

  it("membatasi recentOrders ke enam baris", async () => {
    for (let i = 0; i < 8; i++) await placeOrder(1, "PAID");
    const m = await metrics(7);
    expect(m.recentOrders).toHaveLength(6);
  });

  it("menghitung user baru per periode relatif terhadap baseline", async () => {
    const baseline = (await metrics(7)).newUsers.value;
    await prisma.user.create({
      data: { email: "baru@test.id", name: "Baru", passwordHash: "x:y", createdAt: daysAgo(1) },
    });
    await prisma.user.create({
      data: { email: "lama@test.id", name: "Lama", passwordHash: "x:y", createdAt: daysAgo(10) },
    });
    const m = await metrics(7);
    expect(m.newUsers.value).toBe(baseline + 1);
    expect(m.newUsers.previous).toBe(1);
  });
});
