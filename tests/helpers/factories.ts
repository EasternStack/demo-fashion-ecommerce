import { prisma } from "@/server/db";
import { hashPassword } from "@/server/session";

let seq = 0;
const nextSeq = () => ++seq;

export async function makeUser(role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  return prisma.user.create({
    data: {
      email: `user${nextSeq()}@test.id`,
      name: `User ${seq}`,
      passwordHash: await hashPassword("rahasia123"),
      role,
    },
  });
}

export async function makeCategory(name?: string) {
  const n = name ?? `Kategori ${nextSeq()}`;
  return prisma.category.create({
    data: { name: n, slug: n.toLowerCase().replace(/\s+/g, "-") },
  });
}

export type MakeProductOpts = {
  colors?: { name: string; hex: string }[];
  sizes?: string[];
  stock?: number;
  basePrice?: number;
  isActive?: boolean;
};

export async function makeProduct(categoryId: string, opts: MakeProductOpts = {}) {
  const n = nextSeq();
  const colors = opts.colors ?? [{ name: "Hitam", hex: "#111111" }];
  const sizes = opts.sizes ?? ["M"];
  const stock = opts.stock ?? 5;
  const product = await prisma.product.create({
    data: {
      categoryId,
      name: `Produk ${n}`,
      slug: `produk-${n}`,
      description: `Deskripsi produk ${n}`,
      basePrice: opts.basePrice ?? 100000 + n,
      images: [`/images/products/produk-${n}.jpg`],
      isActive: opts.isActive ?? true,
    },
  });
  const variants = await Promise.all(
    colors.flatMap((c) =>
      sizes.map((s) =>
        prisma.productVariant.create({
          data: {
            productId: product.id,
            colorName: c.name,
            colorHex: c.hex,
            size: s,
            stock,
            sku: `SKU-${product.slug}-${c.name}-${s}`.toUpperCase().replace(/\s+/g, "-"),
          },
        }),
      ),
    ),
  );
  return { ...product, variants };
}
