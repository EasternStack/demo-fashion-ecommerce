import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/session";

const prisma = new PrismaClient();

type VariantSeed = { color: string; hex: string; sizes: Record<string, number> };
type ProductSeed = {
  name: string; slug: string; category: string; description: string;
  basePrice: number; variants: VariantSeed[]; extraImages?: string[];
};

const CATEGORIES = [
  { name: "Pria", slug: "pria" },
  { name: "Wanita", slug: "wanita" },
  { name: "Tas", slug: "tas" },
  { name: "Kacamata", slug: "kacamata" },
  { name: "Beanie", slug: "beanie" },
];

const PRODUCTS: ProductSeed[] = [
  {
    name: "Jaket Ringer Knit Pria", slug: "jaket-ringer-pria", category: "pria",
    description: "Jaket rajut berkerah ringer dengan ritsleting depan, potongan regular.",
    basePrice: 489000,
    variants: [
      { color: "Hitam", hex: "#1c1c1c", sizes: { S: 6, M: 8, L: 5 } },
      { color: "Sage", hex: "#a9c3a2", sizes: { S: 4, M: 7, L: 3 } },
    ],
  },
  {
    name: "Kemeja Boxy Lipit Pria", slug: "kemeja-kotak-pria", category: "pria",
    description: "Kemeja boxy dengan krease lipit, bahan twill tebal.",
    basePrice: 385000,
    variants: [
      { color: "Krem", hex: "#e8dcc8", sizes: { M: 6, L: 6, XL: 4 } },
      { color: "Cokelat", hex: "#5b4232", sizes: { M: 5, L: 4, XL: 2 } },
    ],
  },
  {
    name: "Cardigan Rajut Zip Wanita", slug: "cardigan-rajut-wanita", category: "wanita",
    description: "Cardigan rajut kabel dengan zip dua arah, potongan cropped.",
    basePrice: 429000,
    variants: [
      { color: "Krem", hex: "#e8dcc8", sizes: { S: 5, M: 6 } },
      { color: "Hitam", hex: "#1c1c1c", sizes: { S: 4, M: 4 } },
    ],
  },
  {
    name: "Celana Pleats Pria", slug: "celana-pleats-pria", category: "pria",
    description: "Celana panjang pleats dengan jatuh kain yang rapi.",
    basePrice: 359000,
    variants: [
      { color: "Olive", hex: "#6b7350", sizes: { 28: 4, 30: 6, 32: 5 } },
      { color: "Taupe", hex: "#8a7a68", sizes: { 28: 3, 30: 5, 32: 4 } },
    ],
  },
  {
    name: "Tas Tote Kulit", slug: "tas-tote-kulit", category: "tas",
    description: "Tas tote kulit full-grain dengan jahitan tangan.",
    basePrice: 749000,
    variants: [{ color: "Cokelat", hex: "#5b4232", sizes: { All: 7 } }],
  },
  {
    name: "Tas Selempang Kulit", slug: "tas-selempang-kulit", category: "tas",
    description: "Tas selempang kulit dengan strap dapat disesuaikan.",
    basePrice: 559000,
    variants: [{ color: "Hitam", hex: "#1c1c1c", sizes: { All: 9 } }],
  },
  {
    name: "Kacamata Hitam Frame Kotak", slug: "kacamata-hitam", category: "kacamata",
    description: "Kacamata hitam lensa UV400 dengan frame asetat kotak.",
    basePrice: 289000,
    variants: [{ color: "Hitam", hex: "#1c1c1c", sizes: { All: 12 } }],
  },
  {
    name: "Beanie Rajut Wol", slug: "beanie-rajut-wol", category: "beanie",
    description: "Beanie rajut wol murni dengan lipatan tebal.",
    basePrice: 154000,
    variants: [{ color: "Hitam", hex: "#1c1c1c", sizes: { All: 15 } }],
  },
  {
    name: "Kaus Lengan Panjang Krease", slug: "kaus-lengan-panjang", category: "pria",
    description: "Kaus lengan panjang dengan krease depan, bahan katun tebal.",
    basePrice: 245000,
    variants: [
      { color: "Putih", hex: "#f2f0ea", sizes: { S: 6, M: 8, L: 6 } },
      { color: "Hitam", hex: "#1c1c1c", sizes: { S: 5, M: 7, L: 5 } },
    ],
  },
  {
    name: "Rok Pleats Wanita", slug: "rok-pleats-wanita", category: "wanita",
    description: "Rok midi pleats dengan pinggang elastis tersembunyi.",
    basePrice: 315000,
    variants: [
      { color: "Sage", hex: "#a9c3a2", sizes: { S: 5, M: 5 } },
      { color: "Krem", hex: "#e8dcc8", sizes: { S: 4, M: 6 } },
    ],
  },
  {
    name: "Sweater Kerah Bulat Wanita", slug: "sweater-wanita", category: "wanita",
    description: "Sweater rajut kerah bulat dengan tekstur waffle.",
    basePrice: 365000,
    variants: [
      { color: "Taupe", hex: "#8a7a68", sizes: { S: 6, M: 4 } },
      { color: "Hitam", hex: "#1c1c1c", sizes: { S: 5, M: 5 } },
    ],
  },
  {
    name: "Beanie Ombre Knit", slug: "beanie-ombre", category: "beanie",
    description: "Beanie rajut dengan gradasi warna ombre.",
    basePrice: 174000,
    variants: [{ color: "Cokelat", hex: "#5b4232", sizes: { All: 10 } }],
  },
];

function slugColor(color: string) {
  return color.toLowerCase();
}

async function main() {
  const [adminHash, customerHash] = await Promise.all([
    hashPassword("admin1234"),
    hashPassword("customer1234"),
  ]);
  await prisma.user.upsert({
    where: { email: "admin@demo.id" },
    update: {},
    create: { email: "admin@demo.id", name: "Admin Demo", passwordHash: adminHash, role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "customer@demo.id" },
    update: {},
    create: { email: "customer@demo.id", name: "Customer Demo", passwordHash: customerHash, role: "CUSTOMER" },
  });

  const categoryBySlug = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
    categoryBySlug.set(c.slug, row.id);
  }

  for (const p of PRODUCTS) {
    const images = p.variants.map((v) => `/images/products/${p.slug}-${slugColor(v.color)}.png`);
    for (const extra of p.extraImages ?? []) {
      for (const v of p.variants) {
        images.push(`/images/products/${p.slug}-${slugColor(v.color)}-${extra}.png`);
      }
    }
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) {
      await prisma.product.delete({ where: { id: existing.id } });
    }
    await prisma.product.create({
      data: {
        categoryId: categoryBySlug.get(p.category)!,
        name: p.name,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice,
        images,
        variants: {
          create: p.variants.flatMap((v) =>
            Object.entries(v.sizes).map(([size, stock]) => ({
              colorName: v.color,
              colorHex: v.hex,
              size,
              stock,
              sku: `${p.slug}-${slugColor(v.color)}-${size}`.toUpperCase(),
            })),
          ),
        },
      },
    });
  }
  console.log("Seed selesai:", await prisma.product.count(), "produk");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
