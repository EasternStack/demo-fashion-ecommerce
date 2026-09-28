import { prisma } from "@/server/db";
import type { Category } from "@prisma/client";

export type CatalogColor = { name: string; hex: string };
export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  images: string[];
  colors: CatalogColor[];
  sizes: string[];
};
export type CatalogVariant = {
  id: string;
  colorName: string;
  colorHex: string;
  size: string;
  stock: number;
  sku: string;
};
export type ProductDetail = CatalogProduct & {
  description: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  material: string | null;
  careInstructions: string | null;
  fit: string | null;
  features: string[];
  variants: CatalogVariant[];
};

type ListOpts = { categorySlug?: string; q?: string; includeInactive?: boolean };

function toCatalogProduct(product: {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  images: string[];
  variants: { colorName: string; colorHex: string; size: string }[];
}): CatalogProduct {
  const colors: CatalogColor[] = [];
  const sizes: string[] = [];
  for (const v of product.variants) {
    if (!colors.some((c) => c.name === v.colorName)) colors.push({ name: v.colorName, hex: v.colorHex });
    if (!sizes.includes(v.size)) sizes.push(v.size);
  }
  return { id: product.id, slug: product.slug, name: product.name, basePrice: product.basePrice, images: product.images, colors, sizes };
}

export async function listCategories(): Promise<Category[]> {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function listProducts(opts: ListOpts = {}): Promise<CatalogProduct[]> {
  const products = await prisma.product.findMany({
    where: {
      isActive: opts.includeInactive ? undefined : true,
      category: opts.categorySlug ? { slug: opts.categorySlug } : undefined,
      name: opts.q ? { contains: opts.q, mode: "insensitive" } : undefined,
    },
    include: { variants: { select: { colorName: true, colorHex: true, size: true } } },
    orderBy: { createdAt: "desc" },
  });
  return products.map(toCatalogProduct);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { variants: { orderBy: [{ colorName: "asc" }, { size: "asc" }] }, category: true },
  });
  if (!product || !product.isActive) return null;
  return {
    ...toCatalogProduct(product),
    description: product.description,
    categoryId: product.categoryId,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    material: product.material,
    careInstructions: product.careInstructions,
    fit: product.fit,
    features: product.features,
    variants: product.variants.map((v) => ({
      id: v.id,
      colorName: v.colorName,
      colorHex: v.colorHex,
      size: v.size,
      stock: v.stock,
      sku: v.sku,
    })),
  };
}
