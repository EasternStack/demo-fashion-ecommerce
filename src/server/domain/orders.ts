import type { OrderStatus } from "@prisma/client";
import { SHIPPING_FLAT_COST } from "@/lib/constants";
import { canTransition } from "@/lib/order-status";
import { prisma } from "@/server/db";
import { assertRole, type Session } from "@/server/session";
import type { Result } from "@/server/domain/cart";
import { mockCourier } from "@/server/domain/shipping/mock-courier";

export type AddressInput = {
  recipient: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
  postalCode: string;
};

export type OrderSummary = {
  code: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  itemCount: number;
  customerName?: string;
};

export type OrderItemView = {
  productName: string;
  variantLabel: string;
  unitPrice: number;
  qty: number;
};

export type OrderDetail = OrderSummary & {
  subtotal: number;
  shippingCost: number;
  items: OrderItemView[];
  shipping: AddressInput;
  payment: { provider: string; method: string; status: string; last4: string | null; paidAt: Date | null } | null;
  shipment: { carrier: string; trackingNumber: string } | null;
  events: { status: OrderStatus; note: string | null; createdAt: Date }[];
};

function generateOrderCode(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ESV-${y}${m}${d}-${suffix}`;
}

export async function createOrderFromCart(
  userId: string,
  address: AddressInput,
): Promise<{ ok: true; orderCode: string } | { error: string }> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  if (!cart || cart.items.length === 0) return { error: "Keranjang kosong." };

  const subtotal = cart.items.reduce((sum, i) => sum + i.qty * i.variant.product.basePrice, 0);
  const total = subtotal + SHIPPING_FLAT_COST;
  const orderCode = generateOrderCode();

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of cart.items) {
        const updated = await tx.productVariant.updateMany({
          where: { id: item.variantId, stock: { gte: item.qty } },
          data: { stock: { decrement: item.qty } },
        });
        if (updated.count !== 1) throw new Error("STOCK_INSUFFICIENT");
      }
      await tx.order.create({
        data: {
          code: orderCode,
          userId,
          status: "PENDING",
          subtotal,
          shippingCost: SHIPPING_FLAT_COST,
          total,
          shipRecipient: address.recipient,
          shipPhone: address.phone,
          shipLine1: address.line1,
          shipCity: address.city,
          shipProvince: address.province,
          shipPostalCode: address.postalCode,
          items: {
            create: cart.items.map((item) => ({
              variantId: item.variantId,
              productName: item.variant.product.name,
              variantLabel: `${item.variant.colorName} / ${item.variant.size}`,
              unitPrice: item.variant.product.basePrice,
              qty: item.qty,
            })),
          },
          payment: { create: { provider: "mock", method: "Kartu Kredit (MockPay)", status: "PENDING" } },
          events: { create: { status: "PENDING", note: "Pesanan dibuat, menunggu pembayaran" } },
        },
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STOCK_INSUFFICIENT") {
      return { error: "Stok tidak mencukupi." };
    }
    throw e;
  }
  return { ok: true, orderCode };
}

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  opts: { actor?: Session; note?: string } = {},
): Promise<Result> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Pesanan tidak ditemukan." };
  if (!canTransition(order.status, to)) return { error: "Transisi status tidak valid." };

  if (to === "SHIPPED") {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
      await tx.orderEvent.create({ data: { orderId, status: to, note: opts.note ?? "Paket diserahkan ke kurir" } });
    });
    await mockCourier.createShipment(orderId);
    return { ok: true };
  }

  if (to === "CANCELLED") {
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.qty } },
        });
      }
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
      await tx.orderEvent.create({ data: { orderId, status: to, note: opts.note ?? "Pesanan dibatalkan, stok dikembalikan" } });
    });
    return { ok: true };
  }

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: to } }),
    prisma.orderEvent.create({ data: { orderId, status: to, note: opts.note } }),
  ]);
  return { ok: true };
}

export async function adminTransition(orderCode: string, to: OrderStatus, actor: Session | null): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const order = await prisma.order.findUnique({ where: { code: orderCode } });
  if (!order) return { error: "Pesanan tidak ditemukan." };
  return transitionOrder(order.id, to, { actor: actor!, note: undefined });
}

function toSummary(order: {
  code: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  items: { qty: number }[];
  user?: { name: string };
}): OrderSummary {
  return {
    code: order.code,
    status: order.status,
    total: order.total,
    createdAt: order.createdAt,
    itemCount: order.items.reduce((s, i) => s + i.qty, 0),
    customerName: order.user?.name,
  };
}

export async function listOrdersForUser(userId: string): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: { select: { qty: true } } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map(toSummary);
}

export async function listOrdersForAdmin(status?: OrderStatus): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    include: { items: { select: { qty: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map(toSummary);
}

async function buildDetail(order: NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>> & {
  items: { productName: string; variantLabel: string; unitPrice: number; qty: number }[];
  payment: { provider: string; method: string; status: string; last4: string | null; paidAt: Date | null } | null;
  shipment: { carrier: string; trackingNumber: string } | null;
  events: { status: OrderStatus; note: string | null; createdAt: Date }[];
  user: { name: string } | null;
}): Promise<OrderDetail> {
  return {
    ...toSummary({ ...order, user: order.user ?? undefined }),
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    items: order.items,
    shipping: {
      recipient: order.shipRecipient,
      phone: order.shipPhone,
      line1: order.shipLine1,
      city: order.shipCity,
      province: order.shipProvince,
      postalCode: order.shipPostalCode,
    },
    payment: order.payment,
    shipment: order.shipment,
    events: order.events,
  };
}

const detailInclude = {
  items: { select: { productName: true, variantLabel: true, unitPrice: true, qty: true } },
  payment: true,
  shipment: true,
  events: { orderBy: { createdAt: "asc" as const } },
  user: { select: { name: true } },
};

export async function getOrderForUser(userId: string, code: string): Promise<OrderDetail | null> {
  const order = await prisma.order.findFirst({ where: { code, userId }, include: detailInclude });
  if (!order) return null;
  return buildDetail(order as Parameters<typeof buildDetail>[0]);
}

export async function getOrderForAdmin(code: string): Promise<OrderDetail | null> {
  const order = await prisma.order.findUnique({ where: { code }, include: detailInclude });
  if (!order) return null;
  return buildDetail(order as Parameters<typeof buildDetail>[0]);
}
