import { prisma } from "@/server/db";
import type { CardInput, PaymentProvider, PaymentResult } from "./index";

export function shouldDecline(cardNumber: string): boolean {
  return cardNumber.replace(/\D/g, "").endsWith("0002");
}

export function validateCard(input: CardInput): { ok: true } | { error: string } {
  const digits = input.cardNumber.replace(/\D/g, "");
  if (digits.length !== 16) return { error: "Nomor kartu harus 16 digit." };
  const m = input.expiry.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return { error: "Format expiry harus MM/YY." };
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  const now = new Date();
  const expiryEnd = new Date(year, month, 1);
  if (month < 1 || month > 12 || expiryEnd <= now) return { error: "Kartu kedaluwarsa." };
  if (!/^\d{3}$/.test(input.cvc)) return { error: "CVC harus 3 digit." };
  return { ok: true };
}

export const mockGateway: PaymentProvider = {
  validate: validateCard,
  settle: (orderCode, input) => confirmPayment(orderCode, input),
};

export async function confirmPayment(orderCode: string, input: CardInput): Promise<PaymentResult> {
  const validation = validateCard(input);
  if (validation !== undefined && "error" in validation) return validation;
  const order = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true } });
  if (!order || !order.payment) return { error: "Pesanan tidak ditemukan." };
  if (order.status !== "PENDING") return { error: "Pesanan sudah tidak menunggu pembayaran." };
  const last4 = input.cardNumber.replace(/\D/g, "").slice(-4);
  if (shouldDecline(input.cardNumber)) {
    await prisma.payment.update({
      where: { orderId: order.id },
      data: { status: "FAILED", last4, method: "Kartu Kredit (MockPay)" },
    });
    return { error: "Pembayaran ditolak oleh penerbit kartu (mock)." };
  }
  await prisma.$transaction([
    prisma.payment.update({
      where: { orderId: order.id },
      data: { status: "SUCCESS", last4, method: "Kartu Kredit (MockPay)", paidAt: new Date() },
    }),
    prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
    prisma.orderEvent.create({ data: { orderId: order.id, status: "PAID", note: "Pembayaran diterima (MockPay)" } }),
  ]);
  return { ok: true };
}
