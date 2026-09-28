import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  getUserForAdmin,
  listUsersForAdmin,
  resetUserPassword,
  setUserRole,
  setUserSuspended,
} from "@/server/domain/admin-users";
import { addToCart } from "@/server/domain/cart";
import { createOrderFromCart, transitionOrder } from "@/server/domain/orders";
import { verifyPassword, type Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

beforeEach(cleanDb);

async function adminSession() {
  const admin = await makeUser("ADMIN");
  return { admin, session: { userId: admin.id, role: "ADMIN" } as Session };
}

describe("setUserRole", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(setUserRole(target.id, "ADMIN", actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("menolak aktor tanpa sesi", async () => {
    const target = await makeUser();
    await expect(setUserRole(target.id, "ADMIN", null)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("mempromosikan customer menjadi admin", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(setUserRole(target.id, "ADMIN", session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.role).toBe("ADMIN");
  });

  it("menurunkan admin menjadi customer bila masih ada admin aktif lain", async () => {
    const { session } = await adminSession();
    const second = await makeUser("ADMIN");
    await expect(setUserRole(second.id, "CUSTOMER", session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: second.id } }))?.role).toBe("CUSTOMER");
  });

  it("menolak mengubah akun sendiri meski masih ada admin lain", async () => {
    const { admin, session } = await adminSession();
    await makeUser("ADMIN");
    await expect(setUserRole(admin.id, "CUSTOMER", session)).resolves.toEqual({
      error: "Tidak bisa mengubah akun sendiri.",
    });
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.role).toBe("ADMIN");
  });

  it("menolak melucuti admin terakhir yang masih aktif", async () => {
    const first = await makeUser("ADMIN");
    const second = await makeUser("ADMIN");
    await prisma.user.update({ where: { id: first.id }, data: { suspendedAt: new Date() } });
    const secondSession: Session = { userId: second.id, role: "ADMIN" };
    await expect(setUserRole(second.id, "CUSTOMER", secondSession)).resolves.toEqual({
      error: "Admin terakhir tidak bisa dilucuti.",
    });
    expect((await prisma.user.findUnique({ where: { id: second.id } }))?.role).toBe("ADMIN");
  });

  it("menolak target yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(setUserRole("tidak-ada", "ADMIN", session)).resolves.toEqual({
      error: "Pengguna tidak ditemukan.",
    });
  });
});

describe("setUserSuspended", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(setUserSuspended(target.id, true, actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("menangguhkan lalu mengaktifkan kembali", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(setUserSuspended(target.id, true, session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.suspendedAt).toBeInstanceOf(Date);

    await expect(setUserSuspended(target.id, false, session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.suspendedAt).toBeNull();
  });

  it("menolak menangguhkan akun sendiri", async () => {
    const { admin, session } = await adminSession();
    await makeUser("ADMIN");
    await expect(setUserSuspended(admin.id, true, session)).resolves.toEqual({
      error: "Tidak bisa mengubah akun sendiri.",
    });
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.suspendedAt).toBeNull();
  });

  it("menolak menangguhkan admin aktif terakhir", async () => {
    const first = await makeUser("ADMIN");
    const second = await makeUser("ADMIN");
    await prisma.user.update({ where: { id: first.id }, data: { role: "CUSTOMER" } });
    const secondSession: Session = { userId: second.id, role: "ADMIN" };
    await expect(setUserSuspended(second.id, true, secondSession)).resolves.toEqual({
      error: "Admin terakhir tidak bisa ditangguhkan.",
    });
    expect((await prisma.user.findUnique({ where: { id: second.id } }))?.suspendedAt).toBeNull();
  });

  it("mengizinkan menangguhkan customer", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(setUserSuspended(target.id, true, session)).resolves.toEqual({ ok: true });
  });

  it("menolak target yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(setUserSuspended("tidak-ada", true, session)).resolves.toEqual({
      error: "Pengguna tidak ditemukan.",
    });
  });
});

describe("resetUserPassword", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(resetUserPassword(target.id, "passwordbaru1", actor)).resolves.toEqual({
      error: "FORBIDDEN",
    });
  });

  it("mengganti password sehingga yang baru lolos dan yang lama gagal", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(resetUserPassword(target.id, "passwordbaru1", session)).resolves.toEqual({ ok: true });
    const hash = (await prisma.user.findUnique({ where: { id: target.id } }))!.passwordHash;
    await expect(verifyPassword("passwordbaru1", hash)).resolves.toBe(true);
    await expect(verifyPassword("rahasia123", hash)).resolves.toBe(false);
  });

  it("menolak password di bawah 8 karakter tanpa mengubah hash", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(resetUserPassword(target.id, "pendek", session)).resolves.toEqual({
      error: "Password minimal 8 karakter.",
    });
    const hash = (await prisma.user.findUnique({ where: { id: target.id } }))!.passwordHash;
    await expect(verifyPassword("rahasia123", hash)).resolves.toBe(true);
  });

  it("boleh mengganti password akun sendiri", async () => {
    const { admin, session } = await adminSession();
    await expect(resetUserPassword(admin.id, "passwordbaru1", session)).resolves.toEqual({ ok: true });
  });

  it("menolak target yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(resetUserPassword("tidak-ada", "passwordbaru1", session)).resolves.toEqual({
      error: "Pengguna tidak ditemukan.",
    });
  });
});

const ADDRESS = {
  recipient: "Penerima Uji",
  phone: "08123456789",
  line1: "Jl. Uji No. 1",
  city: "Jakarta",
  province: "DKI Jakarta",
  postalCode: "10110",
};

async function paidOrderFor(userId: string) {
  const cat = await makeCategory();
  const product = await makeProduct(cat.id, { stock: 20 });
  await addToCart(userId, product.variants[0].id, 1);
  const created = (await createOrderFromCart(userId, ADDRESS)) as { ok: true; orderCode: string };
  const order = await prisma.order.findUniqueOrThrow({ where: { code: created.orderCode } });
  await transitionOrder(order.id, "PAID");
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

describe("listUsersForAdmin", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(listUsersForAdmin(actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("menghitung total belanja hanya dari pesanan yang dibayar", async () => {
    const { session } = await adminSession();
    const buyer = await makeUser();
    const paid = await paidOrderFor(buyer.id);

    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 20 });
    await addToCart(buyer.id, product.variants[0].id, 1);
    const cancelledCreated = (await createOrderFromCart(buyer.id, ADDRESS)) as { orderCode: string };
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { code: cancelledCreated.orderCode } });
    await transitionOrder(cancelled.id, "CANCELLED");

    const result = await listUsersForAdmin(session, { q: buyer.email });
    expect("error" in result).toBe(false);
    const { rows, total } = result as { rows: { orderCount: number; totalSpent: number }[]; total: number };
    expect(total).toBe(1);
    expect(rows[0].orderCount).toBe(1);
    expect(rows[0].totalSpent).toBe(paid.total);
  });

  it("memfilter berdasarkan role", async () => {
    const { admin, session } = await adminSession();
    await makeUser();
    const result = await listUsersForAdmin(session, { role: "ADMIN" });
    expect((result as { total: number }).total).toBe(1);
    expect((result as { rows: { id: string }[] }).rows[0].id).toBe(admin.id);
  });

  it("memfilter berdasarkan status suspensi", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await setUserSuspended(target.id, true, session);
    expect((await listUsersForAdmin(session, { status: "suspended" }) as { total: number }).total).toBe(1);
    expect((await listUsersForAdmin(session, { status: "active" }) as { total: number }).total).toBe(1);
  });

  it("mencari nama dan email secara case-insensitive", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    expect((await listUsersForAdmin(session, { q: target.name.toUpperCase() }) as { total: number }).total).toBe(1);
    expect((await listUsersForAdmin(session, { q: target.email.toUpperCase() }) as { total: number }).total).toBe(1);
    expect((await listUsersForAdmin(session, { q: "zzz-tidak-ada" }) as { total: number }).total).toBe(0);
  });

  it("memotong hasil per halaman", async () => {
    const { session } = await adminSession();
    for (let i = 0; i < 26; i++) await makeUser();
    const page1 = await listUsersForAdmin(session, { page: 1 });
    const page2 = await listUsersForAdmin(session, { page: 2 });
    expect((page1 as { rows: unknown[] }).rows).toHaveLength(25);
    expect((page2 as { rows: unknown[] }).rows).toHaveLength(2);
    expect((page2 as { total: number }).total).toBe(27);
  });
});

describe("getUserForAdmin", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(getUserForAdmin(target.id, actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("mengembalikan null untuk id yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(getUserForAdmin("tidak-ada", session)).resolves.toBeNull();
  });

  it("menyertakan alamat, riwayat pesanan, dan agregat belanja", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await prisma.address.create({ data: { userId: target.id, ...ADDRESS, isDefault: true } });
    const paid = await paidOrderFor(target.id);

    const detail = (await getUserForAdmin(target.id, session)) as {
      addresses: { recipient: string }[];
      orders: { code: string }[];
      orderCount: number;
      totalSpent: number;
      email: string;
    };
    expect(detail.email).toBe(target.email);
    expect(detail.addresses).toHaveLength(1);
    expect(detail.addresses[0].recipient).toBe("Penerima Uji");
    expect(detail.orders.map((o) => o.code)).toContain(paid.code);
    expect(detail.orderCount).toBe(1);
    expect(detail.totalSpent).toBe(paid.total);
  });
});
