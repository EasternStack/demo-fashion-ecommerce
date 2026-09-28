import { prisma } from "@/server/db";
import { assertRole, type Session } from "@/server/session";
import type { Result } from "@/server/domain/cart";

export type VariantInput = { id?: string; colorName: string; colorHex: string; size: string; stock: number };
export type ProductInput = {
  id?: string;
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  basePrice: number;
  images: string[];
  variants: VariantInput[];
};
export type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  basePrice: number;
  totalStock: number;
  isActive: boolean;
};
export type ProductEdit = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  basePrice: number;
  images: string[];
  variants: { id: string; colorName: string; colorHex: string; size: string; stock: number; sold: boolean }[];
};

function baseSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "produk";
}

async function uniqueSlug(desired: string, ignoreId?: string) {
  let slug = desired;
  let n = 2;
  for (;;) {
    const clash = await prisma.product.findFirst({ where: { slug, NOT: { id: ignoreId } } });
    if (!clash) return slug;
    slug = `${desired}-${n++}`;
  }
}

export async function saveProduct(input: ProductInput, actor: Session | null): Promise<{ ok: true; id: string } | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  if (!input.name.trim() || input.basePrice <= 0 || input.variants.length === 0) {
    return { error: "Nama, harga, dan minimal satu varian wajib diisi." };
  }
  if (input.variants.some((v) => v.stock < 0)) return { error: "Stok tidak boleh negatif." };

  if (!input.id) {
    const slug = await uniqueSlug(input.slug.trim() ? baseSlug(input.slug) : baseSlug(input.name));
    const product = await prisma.product.create({
      data: {
        name: input.name.trim(),
        slug,
        categoryId: input.categoryId,
        description: input.description,
        basePrice: input.basePrice,
        images: input.images,
        variants: {
          create: input.variants.map((v) => ({
            colorName: v.colorName,
            colorHex: v.colorHex,
            size: v.size,
            stock: v.stock,
            sku: `${slug}-${v.colorName}-${v.size}`.toUpperCase().replace(/\s+/g, "-"),
          })),
        },
      },
    });
    return { ok: true, id: product.id };
  }

  const existing = await prisma.product.findUnique({ where: { id: input.id }, include: { variants: true } });
  if (!existing) return { error: "Produk tidak ditemukan." };
  const incomingIds = new Set(input.variants.map((v) => v.id).filter(Boolean) as string[]);
  const removed = existing.variants.filter((v) => !incomingIds.has(v.id));
  for (const v of removed) {
    const sold = await prisma.orderItem.count({ where: { variantId: v.id } });
    if (sold > 0) {
      return { error: `Varian ${v.colorName} / ${v.size} sudah pernah terjual dan tidak bisa dihapus.` };
    }
  }
  await prisma.$transaction(async (tx) => {
    for (const v of removed) {
      await tx.productVariant.delete({ where: { id: v.id } });
    }
    for (const v of input.variants) {
      if (v.id) {
        await tx.productVariant.update({
          where: { id: v.id },
          data: { colorName: v.colorName, colorHex: v.colorHex, size: v.size, stock: v.stock },
        });
      } else {
        await tx.productVariant.create({
          data: {
            productId: input.id!,
            colorName: v.colorName,
            colorHex: v.colorHex,
            size: v.size,
            stock: v.stock,
            sku: `${existing.slug}-${v.colorName}-${v.size}`.toUpperCase().replace(/\s+/g, "-"),
          },
        });
      }
    }
    await tx.product.update({
      where: { id: input.id! },
      data: {
        name: input.name.trim(),
        categoryId: input.categoryId,
        description: input.description,
        basePrice: input.basePrice,
        images: input.images,
      },
    });
  });
  return { ok: true, id: input.id };
}

export async function toggleProductActive(productId: string, actor: Session | null): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: "Produk tidak ditemukan." };
  await prisma.product.update({ where: { id: productId }, data: { isActive: !product.isActive } });
  return { ok: true };
}

export async function listProductsForAdmin(actor: Session | null): Promise<AdminProductRow[] | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const products = await prisma.product.findMany({
    include: { category: true, variants: { select: { stock: true } } },
    orderBy: { createdAt: "desc" },
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    categoryName: p.category.name,
    basePrice: p.basePrice,
    totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
    isActive: p.isActive,
  }));
}

export async function getProductForEdit(id: string, actor: Session | null): Promise<ProductEdit | null | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });
  if (!product) return null;
  const soldVariantIds = new Set(
    (
      await prisma.orderItem.findMany({
        where: { variant: { productId: id } },
        select: { variantId: true },
      })
    ).map((o) => o.variantId),
  );
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId,
    description: product.description,
    basePrice: product.basePrice,
    images: product.images,
    variants: product.variants.map((v) => ({
      id: v.id,
      colorName: v.colorName,
      colorHex: v.colorHex,
      size: v.size,
      stock: v.stock,
      sold: soldVariantIds.has(v.id),
    })),
  };
}
