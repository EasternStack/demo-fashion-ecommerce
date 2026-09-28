import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addToCart } from "@/server/domain/cart";
import {
  adminTransition,
  createOrderFromCart,
  getOrderForAdmin,
  listOrdersForAdmin,
  transitionOrder,
} from "@/server/domain/orders";
import { confirmPayment } from "@/server/domain/payments/mock-gateway";
import type { Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

const admin: Session = { userId: "admin-test", role: "ADMIN" };
const customerSession = (userId: string): Session => ({ userId, role: "CUSTOMER" });

const address = {
  recipient: "Budi",
  phone: "081234567890",
  line1: "Jl. Melati No. 1",
  city: "Bandung",
  province: "Jawa Barat",
  postalCode: "40115",
};

beforeEach(cleanDb);

async function setupCart(stock = 5) {
  const user = await makeUser();
  const cat = await makeCategory();
  const product = await makeProduct(cat.id, { stock });
  await addToCart(user.id, product.variants[0].id, 2);
  return { user, product };
}

describe("createOrderFromCart", () => {
  it("membuat order PENDING, mengurangi stok, dan mengosongkan cart", async () => {
    const { user, product } = await setupCart(5);
    const result = await createOrderFromCart(user.id, address);
    expect(result).toMatchObject({ ok: true });
    const code = (result as { ok: true; orderCode: string }).orderCode;
    const order = await prisma.order.findUnique({ where: { code }, include: { items: true, payment: true, events: true } });
    expect(order?.status).toBe("PENDING");
    expect(order?.items).toHaveLength(1);
    expect(order?.shippingCost).toBe(15000);
    expect(order?.payment?.status).toBe("PENDING");
    expect(order?.events.map((e) => e.status)).toEqual(["PENDING"]);
    const variant = await prisma.productVariant.findUnique({ where: { id: product.variants[0].id } });
    expect(variant?.stock).toBe(3);
    const cartView = await prisma.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(cartView).toHaveLength(0);
  });

  it("rollback seluruh transaksi saat stok tidak mencukupi", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const a = await makeProduct(cat.id, { stock: 5 });
    const b = await makeProduct(cat.id, { stock: 1 });
    await addToCart(user.id, a.variants[0].id, 2);
    await prisma.cartItem.create({
      data: { cart: { connect: { userId: user.id } }, variant: { connect: { id: b.variants[0].id } }, qty: 3 },
    });
    const result = await createOrderFromCart(user.id, address);
    expect(result).toEqual({ error: "Stok tidak mencukupi." });
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.productVariant.findUnique({ where: { id: a.variants[0].id } }))?.stock).toBe(5);
  });

  it("menolak cart kosong", async () => {
    const user = await makeUser();
    await expect(createOrderFromCart(user.id, address)).resolves.toEqual({ error: "Keranjang kosong." });
  });
});

describe("confirmPayment", () => {
  it("sukses: payment SUCCESS dan order PAID", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const result = await confirmPayment(orderCode, { cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" });
    expect(result).toEqual({ ok: true });
    const order = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true, events: true } });
    expect(order?.status).toBe("PAID");
    expect(order?.payment?.status).toBe("SUCCESS");
    expect(order?.payment?.last4).toBe("4242");
    expect(order?.events.at(-1)?.status).toBe("PAID");
  });

  it("decline: payment FAILED dan order tetap PENDING, retry memakai record sama", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const gagal = await confirmPayment(orderCode, { cardNumber: "4242424242420002", expiry: "12/29", cvc: "123" });
    expect(gagal).toMatchObject({ error: expect.any(String) });
    const order = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true } });
    expect(order?.status).toBe("PENDING");
    expect(order?.payment?.status).toBe("FAILED");
    const paymentId = order?.payment?.id;
    await confirmPayment(orderCode, { cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" });
    const after = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true } });
    expect(after?.payment?.id).toBe(paymentId);
    expect(after?.payment?.status).toBe("SUCCESS");
  });
});

describe("transisi status & cancel", () => {
  it("alur bahagia sampai delivered membuat resi", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    await confirmPayment(orderCode, { cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" });
    const order = await prisma.order.findUnique({ where: { code: orderCode } });
    expect(await transitionOrder(order!.id, "PROCESSING", { actor: admin })).toEqual({ ok: true });
    expect(await transitionOrder(order!.id, "SHIPPED", { actor: admin })).toEqual({ ok: true });
    const shipped = await prisma.order.findUnique({ where: { id: order!.id }, include: { shipment: true } });
    expect(shipped?.shipment?.trackingNumber).toMatch(/^MKX-\d{6}$/);
    expect(await transitionOrder(order!.id, "DELIVERED", { actor: admin })).toEqual({ ok: true });
  });

  it("menolak transisi invalid", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const order = await prisma.order.findUnique({ where: { code: orderCode } });
    const result = await transitionOrder(order!.id, "SHIPPED", { actor: admin });
    expect(result).toEqual({ error: "Transisi status tidak valid." });
  });

  it("cancel merestore stok", async () => {
    const { user, product } = await setupCart(5);
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const result = await adminTransition(orderCode, "CANCELLED", admin);
    expect(result).toEqual({ ok: true });
    const variant = await prisma.productVariant.findUnique({ where: { id: product.variants[0].id } });
    expect(variant?.stock).toBe(5);
  });

  it("adminTransition menolak role customer", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const result = await adminTransition(orderCode, "CANCELLED", customerSession(user.id));
    expect(result).toEqual({ error: "FORBIDDEN" });
  });

  it("getOrderForAdmin mengembalikan detail lengkap", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const detail = await getOrderForAdmin(orderCode);
    expect(detail?.items[0].productName).toBeTruthy();
    expect(detail?.shipping.city).toBe("Bandung");
  });
});

describe("listOrdersForAdmin", () => {
  const testAddress = {
    recipient: "Penerima Uji",
    phone: "08123456789",
    line1: "Jl. Uji No. 1",
    city: "Jakarta",
    province: "DKI Jakarta",
    postalCode: "10110",
  };

  async function placeOne(userId: string) {
    return (await createOrderFromCart(userId, testAddress)) as { ok: true; orderCode: string };
  }

  it("mengembalikan rows dan total tanpa filter", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    await placeOne(user.id);
    const result = await listOrdersForAdmin();
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customerName).toBe(user.name);
  });

  it("memfilter berdasarkan status", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    const { orderCode } = await placeOne(user.id);
    expect((await listOrdersForAdmin({ status: "PAID" })).total).toBe(0);
    expect((await listOrdersForAdmin({ status: "PENDING" })).rows[0].code).toBe(orderCode);
  });

  it("mencari berdasarkan kode pesanan secara case-insensitive", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    const { orderCode } = await placeOne(user.id);
    expect((await listOrdersForAdmin({ q: orderCode.toLowerCase() })).total).toBe(1);
    expect((await listOrdersForAdmin({ q: "zzz-tidak-ada" })).total).toBe(0);
  });

  it("mencari berdasarkan nama pembeli", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    await placeOne(user.id);
    expect((await listOrdersForAdmin({ q: user.name.toUpperCase() })).total).toBe(1);
  });

  it("mencari berdasarkan nama penerima", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    await placeOne(user.id);
    expect((await listOrdersForAdmin({ q: "penerima uji" })).total).toBe(1);
  });

  it("take melewati pagination dan total sama dengan panjang rows", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 50 });
    for (let i = 0; i < 3; i++) {
      await addToCart(user.id, product.variants[0].id, 1);
      await placeOne(user.id);
    }
    const result = await listOrdersForAdmin({ take: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});
