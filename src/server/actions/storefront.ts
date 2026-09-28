"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { addToCart, removeCartItem, setCartQty, type Result } from "@/server/domain/cart";

export async function addToCartAction(formData: FormData): Promise<Result> {
  const session = await requireUser();
  const variantId = String(formData.get("variantId") ?? "");
  const qty = Number(formData.get("qty") ?? 1);
  const result = await addToCart(session.userId, variantId, qty);
  if ("error" in result) return result;
  redirect("/cart");
}

export async function setCartQtyAction(variantId: string, qty: number): Promise<Result> {
  const session = await requireUser();
  return setCartQty(session.userId, variantId, qty);
}

export async function removeCartItemAction(variantId: string): Promise<Result> {
  const session = await requireUser();
  return removeCartItem(session.userId, variantId);
}

import { createOrderFromCart, type AddressInput } from "@/server/domain/orders";

export type CheckoutState = { error?: string } | null;

export async function createOrderAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const session = await requireUser();
  const addressId = String(formData.get("addressId") ?? "");
  let address: AddressInput;
  if (addressId) {
    const saved = await prisma.address.findFirst({ where: { id: addressId, userId: session.userId } });
    if (!saved) return { error: "Alamat tidak ditemukan." };
    address = { recipient: saved.recipient, phone: saved.phone, line1: saved.line1, city: saved.city, province: saved.province, postalCode: saved.postalCode };
  } else {
    address = {
      recipient: String(formData.get("recipient") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      line1: String(formData.get("line1") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      province: String(formData.get("province") ?? "").trim(),
      postalCode: String(formData.get("postalCode") ?? "").trim(),
    };
    if (Object.values(address).some((v) => !v)) return { error: "Semua kolom alamat wajib diisi." };
    if (formData.get("saveAddress") === "on") {
      await prisma.address.create({ data: { ...address, userId: session.userId } });
    }
  }
  const result = await createOrderFromCart(session.userId, address);
  if ("error" in result) return { error: result.error };
  redirect(`/payment/${result.orderCode}`);
}

import { confirmPayment } from "@/server/domain/payments/mock-gateway";
import type { CardInput, PaymentResult } from "@/server/domain/payments";
import { getCurrentSession } from "@/server/session";

export async function confirmPaymentAction(orderCode: string, input: CardInput): Promise<PaymentResult> {
  const session = await getCurrentSession();
  if (!session) return { error: "Silakan masuk terlebih dahulu." };
  const order = await prisma.order.findFirst({ where: { code: orderCode, userId: session.userId } });
  if (!order) return { error: "Pesanan tidak ditemukan." };
  return confirmPayment(orderCode, input);
}
