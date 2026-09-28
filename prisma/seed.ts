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

type ProductDetails = { description: string; material: string; care: string; fit: string; features: string[] };

const PRODUCT_DETAILS: Record<string, ProductDetails> = {
  "jaket-ringer-pria": {
    description: "Jaket rajut berkerah ringer dengan ritsleting depan. Rajutan rapat menahan angin, potongan regular yang mudah dilapis.",
    material: "100% katun combed, rajut 12 gauge",
    care: "Cuci mesin air dingin, keringkan datar, jangan pakai pemutih",
    fit: "Regular fit. Model 187 cm memakai ukuran M.",
    features: ["Kerah ringer kontras dua warna", "Ritsleting dua arah", "Rib di manset dan hem menjaga bentuk"],
  },
  "kemeja-kotak-pria": {
    description: "Kemeja boxy dengan krease lipit permanen di bagian depan. Twill tebal memberi jatuh yang tegas tanpa terasa kaku.",
    material: "Twill katun 220 gsm",
    care: "Cuci mesin air dingin, setrika hangat dari sisi dalam",
    fit: "Boxy fit. Model 187 cm memakai ukuran M.",
    features: ["Krease lipit permanen", "Kancing kerang asli", "Saku dada tersembunyi"],
  },
  "cardigan-rajut-wanita": {
    description: "Cardigan rajut kabel dengan zip dua arah, potongan cropped yang rapi di pinggang.",
    material: "Wol merino 30%, akrilik 70%",
    care: "Cuci tangan air dingin, keringkan datar",
    fit: "Cropped fit. Model 175 cm memakai ukuran S.",
    features: ["Rajut kabel klasik", "Zip dua arah", "Potongan cropped di pinggang"],
  },
  "celana-pleats-pria": {
    description: "Celana panjang pleats dengan jatuh kain yang rapi. Pinggang setengah elastis untuk kenyamanan seharian.",
    material: "Twill poli-viscose",
    care: "Cuci mesin air dingin, hindari putaran kuat",
    fit: "Relaxed fit. Model 187 cm memakai ukuran 30.",
    features: ["Dua pleats depan", "Pinggang setengah elastis", "Saku samping dalam"],
  },
  "tas-tote-kulit": {
    description: "Tas tote kulit full-grain dengan jahitan tangan. Makin lama dipakai, kilap kulit makin terbentuk.",
    material: "Kulit sapi full-grain",
    care: "Lap kain lembap, kondisi dengan leather balm tiap 3 bulan",
    fit: "Muat laptop 14 inci.",
    features: ["Jahitan tangan saddle stitch", "Base keras menjaga bentuk", "Tanpa lapisan dalam agar ringan"],
  },
  "tas-selempang-kulit": {
    description: "Tas selempang kulit dengan strap yang dapat disesuaikan. Kompak untuk harian tanpa mengorbankan slot organisasi.",
    material: "Kulit sapi pull-up",
    care: "Lap kain lembap, hindari paparan air terlalu lama",
    fit: "Muat tablet 11 inci.",
    features: ["Strap adjustable 70-130 cm", "Slot kartu interior", "Resleting logam tahan pakai"],
  },
  "kacamata-hitam": {
    description: "Kacamata hitam lensa UV400 dengan frame asetat kotak. Ringan di hidung untuk pemakaian panjang.",
    material: "Frame asetat, lensa polikarbonat UV400",
    care: "Bersihkan dengan kain mikrofiber, simpan di hard case",
    fit: "Lebar frame 140 mm.",
    features: ["Proteksi UV400", "Engsel pegas", "Hard case dan kain mikrofiber termasuk"],
  },
  "beanie-rajut-wol": {
    description: "Beanie rajut wol murni dengan lipatan tebal. Hangat tanpa terasa gatal di dahi.",
    material: "100% wol merino",
    care: "Cuci tangan air dingin, keringkan datar",
    fit: "Lingkar kepala 56-60 cm.",
    features: ["Rajut double layer", "Lipatan tebal", "Tidak gatal di dahi"],
  },
  "kaus-lengan-panjang": {
    description: "Kaus lengan panjang dengan krease depan, bahan katun tebal. Krease memberi garis vertikal yang membuat siluet terlihat rapi.",
    material: "Katun combed 240 gsm",
    care: "Cuci mesin air dingin, setrika hangat, hindari dryer",
    fit: "Regular fit. Model 187 cm memakai ukuran M.",
    features: ["Krease depan permanen", "Rib kerah rapat", "Katun tebal 240 gsm"],
  },
  "rok-pleats-wanita": {
    description: "Rok midi pleats dengan pinggang elastis tersembunyi. Pleats halus memberi gerak tanpa menambah volume.",
    material: "Poliester pleats permanen",
    care: "Cuci tangan, gantung kering, jangan setrika bagian pleats",
    fit: "Midi, jatuh di bawah lutut. Model 175 cm memakai ukuran S.",
    features: ["Pleats permanen", "Pinggang elastis tersembunyi", "Saku samping"],
  },
  "sweater-wanita": {
    description: "Sweater rajut kerah bulat dengan tekstur waffle. Tebal cukup untuk ruangan ber-AC, ringan untuk dibawa.",
    material: "Katun waffle knit",
    care: "Cuci mesin air dingin dengan laundry bag",
    fit: "Regular fit. Model 175 cm memakai ukuran S.",
    features: ["Tekstur waffle", "Kerah bulat rib", "Manset rapat"],
  },
  "beanie-ombre": {
    description: "Beanie rajut dengan gradasi warna ombre dari pewarna celup tangan. Tiap pasang sedikit berbeda.",
    material: "Campuran wol dan akrilik",
    care: "Cuci tangan air dingin, keringkan datar",
    fit: "Lingkar kepala 56-60 cm.",
    features: ["Gradasi celup tangan", "Rajut rapat", "Unisex"],
  },
};

const REVIEWERS = [
  "Raka Pratama",
  "Sinta Dewi",
  "Bagus Wijaya",
  "Larasati Putri",
  "Yoga Nugroho",
  "Ayu Wulandari",
  "Dimas Saputra",
  "Nadia Rahma",
];

function reviewerEmail(index: number): string {
  return `reviewer${index + 1}@demo.id`;
}

const REVIEWS: { product: string; reviewerIndex: number; rating: number; body: string; date: string }[] = [
  { product: "kaus-lengan-panjang", reviewerIndex: 0, rating: 5, body: "Bahannya tebal tapi tidak panas. Krease depannya bikin kaus ini terlihat lebih rapi dari kaus polos biasa.", date: "2026-08-14" },
  { product: "kaus-lengan-panjang", reviewerIndex: 1, rating: 4, body: "Beli untuk hadiah dan penerimanya suka. Ukuran M sedikit longgar untuk tinggi 170 cm, tapi memang potongannya regular.", date: "2026-07-02" },
  { product: "kaus-lengan-panjang", reviewerIndex: 2, rating: 5, body: "Sudah tiga kali cuci, krease dan bentuk kerahnya masih rapi. Sepadan dengan harganya.", date: "2026-05-19" },
  { product: "kaus-lengan-panjang", reviewerIndex: 3, rating: 3, body: "Warnanya sesuai foto, tapi saya berharap bahannya lebih jatuh. Masih oke untuk layering.", date: "2026-04-08" },
  { product: "jaket-ringer-pria", reviewerIndex: 4, rating: 5, body: "Rajutannya rapat, angin tidak tembus. Ritsleting dua arah praktis saat duduk.", date: "2026-08-01" },
  { product: "jaket-ringer-pria", reviewerIndex: 5, rating: 4, body: "Dibeli untuk suami, panjang lengannya pas. Kerah ringer terlihat lebih bagus asli daripada di foto.", date: "2026-06-11" },
  { product: "tas-tote-kulit", reviewerIndex: 6, rating: 5, body: "Kulitnya tebal dan jahitan tangan terlihat rapi. Muat laptop 14 inci plus dokumen.", date: "2026-07-23" },
  { product: "tas-tote-kulit", reviewerIndex: 7, rating: 4, body: "Awalnya kaku seperti yang diingatkan deskripsi, setelah dua minggu mulai lembut.", date: "2026-03-27" },
  { product: "cardigan-rajut-wanita", reviewerIndex: 1, rating: 5, body: "Cropped-nya pas di pinggang, tidak kependekan. Rajut kabelnya halus.", date: "2026-06-30" },
  { product: "beanie-rajut-wol", reviewerIndex: 2, rating: 4, body: "Hangat dan tidak gatal. Lipatannya tebal jadi masih muat untuk lingkar kepala 60 cm.", date: "2026-05-05" },
  { product: "kacamata-hitam", reviewerIndex: 3, rating: 4, body: "Ringan di hidung, frame kotaknya tidak kebesaran untuk wajah kecil.", date: "2026-08-20" },
  { product: "rok-pleats-wanita", reviewerIndex: 6, rating: 5, body: "Pleats-nya tetap rapi setelah cuci tangan. Pinggang elastisnya tersembunyi jadi tetap terlihat formal.", date: "2026-04-25" },
  { product: "sweater-wanita", reviewerIndex: 5, rating: 4, body: "Tekstur waffle-nya unik, tidak bikin gerah di ruangan ber-AC.", date: "2026-07-15" },
  { product: "celana-pleats-pria", reviewerIndex: 7, rating: 3, body: "Jatuh kainnya rapi tapi pinggangnya sedikit longgar untuk saya. Saran size down kalau di antara dua ukuran.", date: "2026-06-02" },
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

  const reviewerIds: string[] = [];
  for (let i = 0; i < REVIEWERS.length; i++) {
    const email = reviewerEmail(i);
    const row = await prisma.user.upsert({
      where: { email },
      update: { name: REVIEWERS[i] },
      create: { email, name: REVIEWERS[i], passwordHash: customerHash },
    });
    reviewerIds.push(row.id);
  }

  const categoryBySlug = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
    categoryBySlug.set(c.slug, row.id);
  }

  // Clear dependent records before recreating products
  await prisma.orderItem.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.review.deleteMany();

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
        description: PRODUCT_DETAILS[p.slug]?.description ?? p.description,
        material: PRODUCT_DETAILS[p.slug]?.material,
        careInstructions: PRODUCT_DETAILS[p.slug]?.care,
        fit: PRODUCT_DETAILS[p.slug]?.fit,
        features: PRODUCT_DETAILS[p.slug]?.features ?? [],
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

  for (const r of REVIEWS) {
    const product = await prisma.product.findUnique({ where: { slug: r.product } });
    if (!product) continue;
    await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId: reviewerIds[r.reviewerIndex] } },
      update: { rating: r.rating, body: r.body },
      create: { productId: product.id, userId: reviewerIds[r.reviewerIndex], rating: r.rating, body: r.body, createdAt: new Date(r.date) },
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
