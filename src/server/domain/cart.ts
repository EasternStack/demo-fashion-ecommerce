import { prisma } from "@/server/db";

export type Result = { ok: true } | { error: string };

export type CartItemView = {
  variantId: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  productName: string;
  variantLabel: string;
  image: string | null;
  slug: string;
  active: boolean;
};

export type CartView = { items: CartItemView[]; subtotal: number; itemCount: number };

async function ensureCart(userId: string) {
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId } });
}

export async function getCartView(userId: string): Promise<CartView> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: { variant: { include: { product: true } } },
      },
    },
  });
  if (!cart) return { items: [], subtotal: 0, itemCount: 0 };
  const items: CartItemView[] = cart.items.map((item) => ({
    variantId: item.variantId,
    qty: item.qty,
    unitPrice: item.variant.product.basePrice,
    lineTotal: item.qty * item.variant.product.basePrice,
    stock: item.variant.stock,
    productName: item.variant.product.name,
    variantLabel: `${item.variant.colorName} / ${item.variant.size}`,
    image: item.variant.product.images[0] ?? null,
    slug: item.variant.product.slug,
    active: item.variant.product.isActive,
  }));
  return {
    items,
    subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
    itemCount: items.reduce((sum, i) => sum + i.qty, 0),
  };
}

export async function addToCart(userId: string, variantId: string, qty: number): Promise<Result> {
  if (qty < 1) return { error: "Jumlah tidak valid." };
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });
  if (!variant || !variant.product.isActive) return { error: "Produk tidak tersedia." };
  const cart = await ensureCart(userId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });
  const desired = (existing?.qty ?? 0) + qty;
  if (desired > variant.stock) return { error: "Stok tidak mencukupi." };
  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: desired } });
  } else {
    await prisma.cartItem.create({ data: { cartId: cart.id, variantId, qty } });
  }
  return { ok: true };
}

export async function setCartQty(userId: string, variantId: string, qty: number): Promise<Result> {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return { error: "Keranjang kosong." };
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });
  if (!existing) return { error: "Item tidak ada di keranjang." };
  if (qty < 1) {
    await prisma.cartItem.delete({ where: { id: existing.id } });
    return { ok: true };
  }
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) return { error: "Varian tidak ditemukan." };
  if (qty > variant.stock) return { error: "Stok tidak mencukupi." };
  await prisma.cartItem.update({ where: { id: existing.id }, data: { qty } });
  return { ok: true };
}

export async function removeCartItem(userId: string, variantId: string): Promise<{ ok: true }> {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
  }
  return { ok: true };
}

export async function clearCart(userId: string): Promise<void> {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
}
