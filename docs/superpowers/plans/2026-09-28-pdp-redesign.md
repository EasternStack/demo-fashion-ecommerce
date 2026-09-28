# PDP Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah halaman detail produk yang kosong menjadi halaman "editorial commerce" lengkap: galeri thumbnail + panel beli sticky, spec terstruktur, tabel ukuran per kategori, dan rating & ulasan yang bisa ditulis user login.

**Architecture:** RSC-first mengikuti pola domain-module repo: domain baru `reviews` (result object, session sebagai parameter), lib murni `size-charts`, migrasi Prisma untuk field produk + model `Review`, dan pulau client hanya untuk galeri/varian/form ulasan.

**Tech Stack:** Next.js App Router (RSC + server actions), Prisma/PostgreSQL, Tailwind v4 (`@theme` tokens existing), Vitest (integration + unit), React `useActionState`.

**Spec:** `docs/superpowers/specs/2026-09-28-pdp-redesign-design.md`

## Global Constraints

- Semua copy UI berbahasa Indonesia.
- Warna hanya dari token existing: `cream` #f4f6ec, `olive` #2f3b22, `lime` #c8f169, `sage` #a9c3a2, `card` #ececec; hairline = olive dengan opacity (mis. `border-olive/15`).
- Bintang rating: filled olive, kosong `olive/25`; jumlah bintang filled = `Math.round(average)`; bar distribusi lime di atas track `olive/10`; `distribution[0]` = bintang 1.
- Angka tabel ukuran pakai `font-mono`; tidak menambah font baru; tidak menambah keyframe CSS baru — motion hanya class `.reveal-scroll` yang sudah ada di `app/globals.css`.
- Microcopy panel beli verbatim: `Dikirim dalam 2 hari kerja · Retur 14 hari selama belum dipakai`.
- Body ulasan maks 2000 karakter; rating integer 1–5.
- Fungsi domain mengembalikan result object (`{ error }` atau sukses), tidak throw untuk error bisnis; tidak memakai `$queryRaw`.
- Setelah submit ulasan sukses: `revalidatePath(`/produk/${slug}`)`.
- Test: vitest; integrasi di `tests/integration` (helper `cleanDb`, `makeUser`, `makeCategory`, `makeProduct` dari `tests/helpers/db-factories`), fungsi murni di `tests/unit`. `tests/global-setup.ts` otomatis menjalankan `prisma migrate deploy` ke DB test.
- Commit konvensional (`feat:`, `test:`, `chore:`) per task.

---

### Task 1: Schema Prisma — field produk detail + model Review

**Files:**
- Modify: `prisma/schema.prisma` (model `Product` ~baris 63-75, model `User` ~baris 30-41, tambah model `Review` baru)

**Interfaces:**
- Consumes: tidak ada.
- Produces: tabel `Review` dan kolom `Product.material/careInstructions/fit/features` untuk Task 3, 5, 8; relasi balik `User.reviews`.

- [ ] **Step 1: Tambah field di model `Product`**

Di `prisma/schema.prisma`, dalam `model Product` setelah `images String[]`:

```prisma
  material         String?
  careInstructions String?
  fit              String?
  features         String[] @default([])
  reviews          Review[]
```

- [ ] **Step 2: Tambah relasi balik di model `User` dan model `Review`**

Dalam `model User` tambahkan `reviews Review[]` setelah `orders Order[]`. Lalu tambahkan model baru di akhir file:

```prisma
model Review {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  rating    Int
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([productId, userId])
}
```

- [ ] **Step 3: Buat dan terapkan migrasi**

Run: `npx prisma migrate dev --name add_reviews_and_product_details`
Expected: migrasi baru terbuat di `prisma/migrations/`, client ter-generate, tanpa error.

- [ ] **Step 4: Validasi schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add review model and structured product detail fields"
```

---

### Task 2: Lib size-charts (TDD)

**Files:**
- Create: `src/lib/size-charts.ts`
- Test: `tests/unit/size-charts.test.ts`

**Interfaces:**
- Consumes: tidak ada.
- Produces: `type SizeChart { kind: "apparel" | "bag" | "eyewear" | "beanie"; unit: "cm" | "mm"; columns: string[]; rows: { size: string; values: number[] }[]; measureNote: string }` dan `getSizeChart(categorySlug: string): SizeChart | undefined` untuk Task 7.

- [ ] **Step 1: Tulis test yang gagal**

```ts
import { describe, expect, it } from "vitest";
import { getSizeChart } from "@/lib/size-charts";

describe("size-charts", () => {
  it("menyediakan chart konsisten untuk semua kategori bawaan", () => {
    for (const slug of ["pria", "wanita", "tas", "kacamata", "beanie"]) {
      const chart = getSizeChart(slug);
      expect(chart, slug).toBeDefined();
      expect(chart!.columns.length).toBeGreaterThan(0);
      for (const row of chart!.rows) {
        expect(row.values, `${slug}/${row.size}`).toHaveLength(chart!.columns.length);
      }
    }
  });

  it("mengembalikan undefined untuk kategori tak dikenal", () => {
    expect(getSizeChart("sepatu")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Jalankan test, verifikasi gagal**

Run: `npx vitest run tests/unit/size-charts.test.ts`
Expected: FAIL — modul `@/lib/size-charts` tidak ditemukan.

- [ ] **Step 3: Implementasi `src/lib/size-charts.ts`**

```ts
export type SizeChart = {
  kind: "apparel" | "bag" | "eyewear" | "beanie";
  unit: "cm" | "mm";
  columns: string[];
  rows: { size: string; values: number[] }[];
  measureNote: string;
};

const CHARTS: Record<string, SizeChart> = {
  pria: {
    kind: "apparel",
    unit: "cm",
    columns: ["Lingkar Dada", "Panjang Badan", "Bahu", "Lengan"],
    rows: [
      { size: "S", values: [96, 68, 44, 60] },
      { size: "M", values: [100, 70, 46, 61] },
      { size: "L", values: [104, 72, 48, 62] },
      { size: "XL", values: [108, 74, 50, 63] },
    ],
    measureNote: "Ukur serupa pakaian favoritmu yang diletakkan datar, bukan mengukur badan.",
  },
  wanita: {
    kind: "apparel",
    unit: "cm",
    columns: ["Lingkar Dada", "Panjang Badan", "Bahu", "Lengan"],
    rows: [
      { size: "S", values: [88, 62, 38, 56] },
      { size: "M", values: [92, 64, 40, 57] },
      { size: "L", values: [96, 66, 42, 58] },
    ],
    measureNote: "Ukur serupa pakaian favoritmu yang diletakkan datar, bukan mengukur badan.",
  },
  tas: {
    kind: "bag",
    unit: "cm",
    columns: ["Lebar", "Tinggi", "Depth", "Drop Strap"],
    rows: [{ size: "One Size", values: [38, 42, 12, 28] }],
    measureNote: "Dimensi luar tas; drop strap diukur dari puncak bahu ke ujung strap.",
  },
  kacamata: {
    kind: "eyewear",
    unit: "mm",
    columns: ["Lensa", "Bridge", "Temple"],
    rows: [{ size: "One Size", values: [52, 21, 145] }],
    measureNote: "Lensa = lebar satu lensa, bridge = jarak antar lensa, temple = panjang gagang.",
  },
  beanie: {
    kind: "beanie",
    unit: "cm",
    columns: ["Lingkar Kepala", "Tinggi"],
    rows: [{ size: "One Size", values: [58, 22] }],
    measureNote: "Lingkar kepala diukur sejajar dahi; rajutan mengikuti ±2 cm.",
  },
};

export function getSizeChart(categorySlug: string): SizeChart | undefined {
  return CHARTS[categorySlug];
}
```

- [ ] **Step 4: Jalankan test, verifikasi lulus**

Run: `npx vitest run tests/unit/size-charts.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/size-charts.ts tests/unit/size-charts.test.ts
git commit -m "feat: add per-category size charts"
```

---

### Task 3: Domain reviews (TDD)

**Files:**
- Create: `src/server/domain/reviews.ts`
- Test: `tests/integration/reviews.test.ts`

**Interfaces:**
- Consumes: model `Review` dari Task 1; `Session` dari `src/server/session.ts`.
- Produces untuk Task 7 & 8: `getReviewSummary(productId): Promise<{ average: number; count: number; distribution: number[] }>`, `listReviews(productId): Promise<{ id: string; rating: number; body: string; createdAt: Date; userName: string }[]>`, `submitReview(productId, { rating, body }, session): Promise<{ error: "UNAUTHENTICATED" | "INVALID" } | { ok: true }>`, `getOwnReview(productId, userId): Promise<{ rating: number; body: string } | null>`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getReviewSummary, listReviews, submitReview, getOwnReview } from "@/server/domain/reviews";
import type { Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

beforeEach(cleanDb);

async function makeSession(): Promise<Session> {
  const user = await makeUser();
  return { userId: user.id, role: "CUSTOMER" };
}

describe("reviews", () => {
  it("menolak ulasan tanpa session", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    await expect(submitReview(product.id, { rating: 5, body: "Enak dipakai" }, null)).resolves.toEqual({
      error: "UNAUTHENTICATED",
    });
  });

  it("menolak rating di luar 1-5 dan body kosong", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    const session = await makeSession();
    await expect(submitReview(product.id, { rating: 0, body: "Enak" }, session)).resolves.toEqual({ error: "INVALID" });
    await expect(submitReview(product.id, { rating: 6, body: "Enak" }, session)).resolves.toEqual({ error: "INVALID" });
    await expect(submitReview(product.id, { rating: 4, body: "   " }, session)).resolves.toEqual({ error: "INVALID" });
  });

  it("memperbarui ulasan lama alih-alih membuat duplikat", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    const session = await makeSession();
    await submitReview(product.id, { rating: 3, body: "Biasa saja" }, session);
    await submitReview(product.id, { rating: 5, body: "Ternyata enak dipakai" }, session);
    const summary = await getReviewSummary(product.id);
    expect(summary.count).toBe(1);
    const list = await listReviews(product.id);
    expect(list[0].rating).toBe(5);
    expect(list[0].body).toBe("Ternyata enak dipakai");
    expect(await getOwnReview(product.id, session.userId)).toEqual({ rating: 5, body: "Ternyata enak dipakai" });
  });

  it("menghitung rata-rata dan distribusi dari ulasan", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    expect(await getReviewSummary(product.id)).toEqual({ average: 0, count: 0, distribution: [0, 0, 0, 0, 0] });
    const a = await makeSession();
    const b = await makeSession();
    await submitReview(product.id, { rating: 5, body: "Mantap" }, a);
    await submitReview(product.id, { rating: 4, body: "Bagus" }, b);
    expect(await getReviewSummary(product.id)).toEqual({ average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] });
  });

  it("mengurutkan ulasan dari yang terbaru dengan nama penulis", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    const a = await makeUser();
    const b = await makeUser();
    await prisma.review.create({
      data: { productId: product.id, userId: a.id, rating: 4, body: "Ulasan lama", createdAt: new Date("2026-01-01") },
    });
    await prisma.review.create({
      data: { productId: product.id, userId: b.id, rating: 5, body: "Ulasan baru", createdAt: new Date("2026-06-01") },
    });
    const list = await listReviews(product.id);
    expect(list.map((r) => r.body)).toEqual(["Ulasan baru", "Ulasan lama"]);
    expect(list[0].userName).toBe(b.name);
  });
});
```

- [ ] **Step 2: Jalankan test, verifikasi gagal**

Run: `npx vitest run tests/integration/reviews.test.ts`
Expected: FAIL — modul `@/server/domain/reviews` tidak ditemukan.

- [ ] **Step 3: Implementasi `src/server/domain/reviews.ts`**

```ts
import { prisma } from "@/server/db";
import type { Session } from "@/server/session";

export type ReviewSummary = { average: number; count: number; distribution: number[] };
export type ReviewItem = { id: string; rating: number; body: string; createdAt: Date; userName: string };
export type SubmitReviewInput = { rating: number; body: string };
export type SubmitReviewResult = { error: "UNAUTHENTICATED" | "INVALID" } | { ok: true };

export async function getReviewSummary(productId: string): Promise<ReviewSummary> {
  const groups = await prisma.review.groupBy({ by: ["rating"], where: { productId }, _count: true });
  const distribution = [0, 0, 0, 0, 0];
  let count = 0;
  let total = 0;
  for (const g of groups) {
    distribution[g.rating - 1] = g._count;
    count += g._count;
    total += g.rating * g._count;
  }
  return { average: count > 0 ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

export async function listReviews(productId: string): Promise<ReviewItem[]> {
  const rows = await prisma.review.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    select: { id: true, rating: true, body: true, createdAt: true, user: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, rating: r.rating, body: r.body, createdAt: r.createdAt, userName: r.user.name }));
}

export async function submitReview(productId: string, input: SubmitReviewInput, session: Session | null): Promise<SubmitReviewResult> {
  if (!session) return { error: "UNAUTHENTICATED" };
  const rating = Math.trunc(input.rating);
  const body = input.body.trim();
  if (rating < 1 || rating > 5 || rating !== input.rating || !body || body.length > 2000) return { error: "INVALID" };
  await prisma.review.upsert({
    where: { productId_userId: { productId, userId: session.userId } },
    update: { rating, body },
    create: { productId, userId: session.userId, rating, body },
  });
  return { ok: true };
}

export async function getOwnReview(productId: string, userId: string): Promise<{ rating: number; body: string } | null> {
  const row = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { rating: true, body: true },
  });
  return row;
}
```

- [ ] **Step 4: Jalankan test, verifikasi lulus**

Run: `npx vitest run tests/integration/reviews.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/reviews.ts tests/integration/reviews.test.ts
git commit -m "feat: add review domain with summary, list, and upsert submit"
```

---

### Task 4: Catalog — bawa kategori dan field detail ke ProductDetail (TDD)

**Files:**
- Modify: `src/server/domain/catalog.ts:22-26` (type `ProductDetail`) dan `:64-83` (`getProductBySlug`)
- Test: `tests/integration/catalog.test.ts` (tambah satu `it` di dalam `describe("catalog")`)

**Interfaces:**
- Consumes: kolom baru `Product` dari Task 1.
- Produces untuk Task 7: `ProductDetail` kini punya `categorySlug: string`, `categoryName: string`, `material: string | null`, `careInstructions: string | null`, `fit: string | null`, `features: string[]`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di dalam `describe("catalog", ...)` di `tests/integration/catalog.test.ts`:

```ts
  it("membawa slug dan nama kategori serta field detail produk", async () => {
    const cat = await makeCategory("Pria");
    const product = await makeProduct(cat.id, {});
    await prisma.product.update({
      where: { id: product.id },
      data: { material: "Katun combed 240 gsm", features: ["Krease depan"] },
    });
    const detail = await getProductBySlug(product.slug);
    expect(detail?.categorySlug).toBe("pria");
    expect(detail?.categoryName).toBe("Pria");
    expect(detail?.material).toBe("Katun combed 240 gsm");
    expect(detail?.features).toEqual(["Krease depan"]);
    expect(detail?.careInstructions).toBeNull();
  });
```

- [ ] **Step 2: Jalankan test, verifikasi gagal**

Run: `npx vitest run tests/integration/catalog.test.ts`
Expected: FAIL — `categorySlug` undefined di hasil `getProductBySlug`.

- [ ] **Step 3: Implementasi di `catalog.ts`**

Ganti type `ProductDetail`:

```ts
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
```

Dan di `getProductBySlug`, ganti `include: { variants: ... }` menjadi:

```ts
    include: { variants: { orderBy: [{ colorName: "asc" }, { size: "asc" }] }, category: true },
```

lalu ganti return object menjadi:

```ts
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
```

- [ ] **Step 4: Jalankan test, verifikasi lulus**

Run: `npx vitest run tests/integration/catalog.test.ts`
Expected: PASS (semua test catalog, termasuk yang baru).

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/catalog.ts tests/integration/catalog.test.ts
git commit -m "feat: expose category and detail fields on product detail"
```

---

### Task 5: Seed — deskripsi detail, fitur, dan ulasan

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: kolom baru dari Task 1.
- Produces: data demo lengkap untuk verifikasi browser di Task 9 (12 produk berisi detail + 8 user reviewer + 14 ulasan).

- [ ] **Step 1: Tambah record detail produk dan data ulasan di `seed.ts`**

Setelah array `PRODUCTS`, tambahkan:

```ts
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
```

- [ ] **Step 2: Pakai detail di loop produk dan seed reviewer + ulasan di `main()`**

Di dalam loop `for (const p of PRODUCTS)`, ganti `description: p.description,` menjadi:

```ts
        description: PRODUCT_DETAILS[p.slug]?.description ?? p.description,
        material: PRODUCT_DETAILS[p.slug]?.material,
        careInstructions: PRODUCT_DETAILS[p.slug]?.care,
        fit: PRODUCT_DETAILS[p.slug]?.fit,
        features: PRODUCT_DETAILS[p.slug]?.features ?? [],
```

Setelah loop user existing (dua `prisma.user.upsert` pertama), tambahkan pembuatan reviewer:

```ts
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
```

Di akhir `main()`, setelah loop produk dan sebelum `console.log`, tambahkan:

```ts
  for (const r of REVIEWS) {
    const product = await prisma.product.findUnique({ where: { slug: r.product } });
    if (!product) continue;
    await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId: reviewerIds[r.reviewerIndex] } },
      update: { rating: r.rating, body: r.body },
      create: { productId: product.id, userId: reviewerIds[r.reviewerIndex], rating: r.rating, body: r.body, createdAt: new Date(r.date) },
    });
  }
```

- [ ] **Step 3: Jalankan seed dan verifikasi jumlah ulasan**

Run: `npm run db:seed`
Expected: output `Seed selesai: 12 produk` tanpa error.

Run: `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.review.count(),p.user.count()]).then(([r,u])=>{console.log('reviews',r,'users',u);return p.\$disconnect()})"`
Expected: `reviews 14 users 10`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed structured product details and customer reviews"
```

---

### Task 6: Bintang, galeri thumbnail, dan revisi VariantPicker

**Files:**
- Create: `src/components/storefront/stars.tsx`
- Create: `src/components/product-gallery.tsx`
- Modify: `src/components/variant-picker.tsx` (rewrite penuh)

**Interfaces:**
- Consumes: tidak ada yang baru.
- Produces untuk Task 7 & 8: `Stars({ value, className })`, `ProductGallery({ images, alt })`, dan `VariantPicker({ variants, images, slug, children })` — `children` dirender di kolom kanan atas (info produk dari server).

- [ ] **Step 1: Buat `src/components/storefront/stars.tsx`**

```tsx
type Props = { value: number; className?: string };

export function Stars({ value, className = "" }: Props) {
  const filled = Math.round(value);
  return (
    <span className={`inline-flex tracking-[2px] ${className}`} aria-label={`Rating ${value} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className={i <= filled ? "text-olive" : "text-olive/25"}>
          ★
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Buat `src/components/product-gallery.tsx`**

```tsx
"use client";

import { useState } from "react";

type Props = { images: string[]; alt: string };

export function ProductGallery({ images, alt }: Props) {
  const [active, setActive] = useState(0);
  const src = images[active] ?? images[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[4/5] bg-card">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((img, i) => (
            <button
              key={img}
              type="button"
              onClick={() => setActive(i)}
              aria-current={i === active}
              aria-label={`Lihat gambar ${i + 1}`}
              className={`h-20 w-16 overflow-hidden border-2 ${i === active ? "border-olive" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `src/components/variant-picker.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import type { CatalogVariant } from "@/server/domain/catalog";
import { addToCartAction } from "@/server/actions/storefront";
import { ProductGallery } from "@/components/product-gallery";

type Props = { variants: CatalogVariant[]; images: string[]; slug: string; children?: ReactNode };

function colorSlug(name: string) {
  return name.toLowerCase();
}

export function VariantPicker({ variants, images, slug, children }: Props) {
  const colors = [...new Map(variants.map((v) => [v.colorName, v.colorHex])).entries()];
  const sizes = [...new Set(variants.map((v) => v.size))];
  const [color, setColor] = useState(colors[0]?.[0] ?? "");
  const [size, setSize] = useState("");
  const selected = variants.find((v) => v.colorName === color && v.size === size);
  const gallery = images.filter((i) => i.includes(`-${colorSlug(color)}.`));
  const shown = gallery.length > 0 ? gallery : images;

  return (
    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr]">
      <ProductGallery key={color} images={shown} alt={slug} />
      <div className="flex flex-col gap-5 self-start md:sticky md:top-24">
        {children}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest">Warna</p>
          <div className="mt-1 flex gap-2">
            {colors.map(([name, hex]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setColor(name);
                  setSize("");
                }}
                title={name}
                aria-label={`Warna ${name}`}
                className={`h-7 w-7 rounded-full border-2 ${color === name ? "border-olive" : "border-transparent"}`}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest">Ukuran</p>
            <a href="#tabel-ukuran" className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100">
              Panduan ukuran
            </a>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {sizes.map((s) => {
              const v = variants.find((x) => x.colorName === color && x.size === s);
              const disabled = !v || v.stock === 0;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSize(s)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    size === s ? "border-olive bg-lime font-semibold" : "border-olive/25"
                  } ${disabled ? "cursor-not-allowed opacity-40 line-through" : ""}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <form action={async (formData: FormData) => { await addToCartAction(formData); }} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="variantId" value={selected?.id ?? ""} />
          <input type="hidden" name="qty" value="1" />
          <button
            disabled={!selected || selected.stock === 0}
            className="rounded-full border border-olive px-6 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {selected && selected.stock === 0 ? "Stok habis" : selected ? "Tambah ke Tas" : "Pilih warna & ukuran dulu"}
          </button>
          {selected && selected.stock > 0 && <span className="text-sm">Stok: {selected.stock}</span>}
        </form>
        <p className="text-xs uppercase tracking-widest opacity-60">Dikirim dalam 2 hari kerja · Retur 14 hari selama belum dipakai</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error (page.tsx lama masih memakai props lama — props lama tetap kompatibel karena `children` opsional; halaman akan dirakit ulang di Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/components/storefront/stars.tsx src/components/product-gallery.tsx src/components/variant-picker.tsx
git commit -m "feat: add thumbnail gallery, stars, and always-visible add-to-cart CTA"
```

---

### Task 7: Rakit halaman — breadcrumb, buy panel, seksi detail & tabel ukuran, produk terkait

**Files:**
- Create: `src/components/storefront/buy-panel.tsx`
- Create: `src/components/storefront/detail-care.tsx`
- Create: `src/components/storefront/size-chart-section.tsx`
- Modify: `app/(shop)/produk/[slug]/page.tsx` (rewrite penuh)

**Interfaces:**
- Consumes: `ProductDetail` (Task 4), `ReviewSummary` (Task 3), `getSizeChart` (Task 2), `VariantPicker`/`Stars` (Task 6), `ProductCard` existing.
- Produces: halaman PDP lengkap kecuali seksi ulasan (Task 8).

- [ ] **Step 1: Buat `src/components/storefront/detail-care.tsx`**

```tsx
type Props = { features: string[]; material: string | null; careInstructions: string | null };

export function DetailCare({ features, material, careInstructions }: Props) {
  if (features.length === 0 && !material && !careInstructions) return null;
  return (
    <section className="reveal-scroll grid gap-8 md:grid-cols-2">
      {features.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest">Fitur</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed">
            {features.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden>—</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(material || careInstructions) && (
        <table className="w-full self-start text-sm">
          <caption className="sr-only">Detail dan perawatan produk</caption>
          <tbody>
            {material && (
              <tr className="border-b border-olive/15">
                <th scope="row" className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-widest opacity-70">
                  Material
                </th>
                <td className="py-2">{material}</td>
              </tr>
            )}
            {careInstructions && (
              <tr className="border-b border-olive/15">
                <th scope="row" className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-widest opacity-70">
                  Perawatan
                </th>
                <td className="py-2">{careInstructions}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Buat `src/components/storefront/size-chart-section.tsx`**

```tsx
import type { SizeChart } from "@/lib/size-charts";

type Props = { chart: SizeChart | undefined; sizes: string[]; fit: string | null };

const POINTS = [
  { x: 61, y: 100 },
  { x: 100, y: 172 },
  { x: 130, y: 30 },
  { x: 30, y: 132 },
];

function ApparelDiagram({ points }: { points: number }) {
  return (
    <svg viewBox="0 0 200 190" className="w-40 flex-none" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M70 30 Q100 46 130 30 L158 44 L172 132 L148 138 L139 92 L139 172 L61 172 L61 92 L52 138 L28 132 L42 44 Z" />
      <line x1="61" y1="100" x2="139" y2="100" strokeDasharray="3 3" />
      <line x1="100" y1="38" x2="100" y2="172" strokeDasharray="3 3" />
      <line x1="70" y1="30" x2="130" y2="30" strokeDasharray="3 3" />
      <line x1="42" y1="46" x2="30" y2="132" strokeDasharray="3 3" />
      {POINTS.slice(0, points).map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="7" fill="#f4f6ec" strokeWidth="1" />
          <text x={p.x - 2.5} y={p.y + 3.5} fill="currentColor" stroke="none" fontSize="10">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function SizeChartSection({ chart, sizes, fit }: Props) {
  if (!chart) return null;
  const rows = chart.rows.filter((r) => sizes.includes(r.size));
  if (rows.length === 0) return null;
  return (
    <section id="tabel-ukuran" className="reveal-scroll">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest">Tabel Ukuran</h2>
        <span className="text-xs opacity-60">dalam {chart.unit}</span>
      </div>
      <div className="mt-4 flex flex-col gap-8 md:flex-row md:items-start">
        <table className="w-full border-collapse font-mono text-sm md:max-w-md">
          <thead>
            <tr className="border-b border-olive/35">
              <th className="py-2 pr-4 text-left font-sans text-xs font-semibold uppercase tracking-widest opacity-70">Ukuran</th>
              {chart.columns.map((c, i) => (
                <th key={c} className="py-2 pr-4 text-right font-sans text-xs font-semibold uppercase tracking-widest opacity-70">
                  {i + 1} {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.size} className="border-b border-olive/15">
                <th scope="row" className="py-2 pr-4 text-left font-bold">
                  {r.size}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="py-2 pr-4 text-right">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {chart.kind === "apparel" && <ApparelDiagram points={chart.columns.length} />}
      </div>
      {fit && <p className="mt-4 inline-block rounded-full bg-lime px-4 py-1 text-xs font-semibold">{fit}</p>}
      <p className="mt-3 text-xs italic opacity-65">{chart.measureNote}</p>
    </section>
  );
}
```

- [ ] **Step 3: Buat `src/components/storefront/buy-panel.tsx`**

```tsx
import { VariantPicker } from "@/components/variant-picker";
import { Stars } from "@/components/storefront/stars";
import { formatIDR } from "@/lib/format";
import type { ProductDetail } from "@/server/domain/catalog";
import type { ReviewSummary } from "@/server/domain/reviews";

type Props = { product: ProductDetail; summary: ReviewSummary };

export function BuyPanel({ product, summary }: Props) {
  return (
    <VariantPicker variants={product.variants} images={product.images} slug={product.slug}>
      <div>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">{product.name}</h1>
        {summary.count > 0 ? (
          <a href="#ulasan" className="mt-2 flex w-fit items-center gap-2 text-sm hover:underline">
            <Stars value={summary.average} />
            <span>{summary.average.toFixed(1).replace(".", ",")}</span>
            <span className="opacity-70">({summary.count} ulasan)</span>
          </a>
        ) : (
          <p className="mt-2 text-sm opacity-70">
            <a href="#ulasan" className="hover:underline">Belum ada ulasan — jadilah yang pertama.</a>
          </p>
        )}
        <p className="mt-3 text-xl">{formatIDR(product.basePrice)}</p>
      </div>
      <p className="text-sm leading-relaxed">{product.description}</p>
    </VariantPicker>
  );
}
```

- [ ] **Step 4: Rewrite `app/(shop)/produk/[slug]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyPanel } from "@/components/storefront/buy-panel";
import { DetailCare } from "@/components/storefront/detail-care";
import { ProductCard } from "@/components/storefront/product-card";
import { SizeChartSection } from "@/components/storefront/size-chart-section";
import { getSizeChart } from "@/lib/size-charts";
import { getProductBySlug, listProducts } from "@/server/domain/catalog";
import { getReviewSummary } from "@/server/domain/reviews";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [summary, sameCategory] = await Promise.all([
    getReviewSummary(product.id),
    listProducts({ categorySlug: product.categorySlug }),
  ]);
  const related = sameCategory.filter((p) => p.id !== product.id).slice(0, 4);
  return (
    <div className="flex flex-col gap-14">
      <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-widest opacity-70">
        <Link href="/" className="hover:opacity-100">Beranda</Link>
        {" / "}
        <Link href={`/kategori/${product.categorySlug}`} className="hover:opacity-100">{product.categoryName}</Link>
        {" / "}
        <span>{product.name}</span>
      </nav>
      <BuyPanel product={product} summary={summary} />
      <DetailCare features={product.features} material={product.material} careInstructions={product.careInstructions} />
      <SizeChartSection chart={getSizeChart(product.categorySlug)} sizes={product.sizes} fit={product.fit} />
      {related.length > 0 && (
        <section className="reveal-scroll">
          <h2 className="text-xs font-semibold uppercase tracking-widest">Produk Terkait</h2>
          <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

Catatan: sampai Task 8, anchor `#ulasan` dari bar rating dan link "Panduan ukuran" belum punya target seksi ulasan — itu normal dan selesai di Task 8. Tabel ukuran hanya muncul kalau ukuran produk beririsan dengan baris chart (celana pleats berukuran 28/30/32 sengaja tidak menampilkan chart apparel).

- [ ] **Step 5: Typecheck dan render check**

Run: `npx tsc --noEmit` lalu `npm run dev` dan buka `http://localhost:3000/produk/kaus-lengan-panjang`.
Expected: breadcrumb, galeri dengan thumbnail, panel kanan sticky dengan CTA selalu terlihat, seksi Fitur/Material, tabel ukuran pria dengan diagram, dan produk terkait tampil. Catatan: tabel ukuran hanya muncul kalau ukuran produk beririsan dengan baris chart (celana pleats berukuran 28/30/32 sengaja tidak menampilkan chart apparel).

- [ ] **Step 6: Commit**

```bash
git add src/components/storefront/buy-panel.tsx src/components/storefront/detail-care.tsx src/components/storefront/size-chart-section.tsx "app/(shop)/produk/[slug]/page.tsx"
git commit -m "feat: rebuild product page with buy panel, specs, and size chart"
```

---

### Task 8: Seksi ulasan — action, form, ringkasan, daftar

**Files:**
- Modify: `src/server/actions/storefront.ts` (tambah `submitReviewAction`)
- Create: `src/components/review-form.tsx`
- Create: `src/components/storefront/reviews-section.tsx`
- Modify: `app/(shop)/produk/[slug]/page.tsx` (ganti placeholder `#ulasan` dengan `ReviewsSection`)

**Interfaces:**
- Consumes: `submitReview`, `getReviewSummary`, `listReviews` (Task 3); `Stars` (Task 6).
- Produces: alur ulasan lengkap end-to-end.

- [ ] **Step 1: Tambah action di `src/server/actions/storefront.ts`**

Tambahkan import di bagian atas: `import { revalidatePath } from "next/cache";` dan `import { submitReview } from "@/server/domain/reviews";`. Lalu di akhir file:

```ts
export type ReviewFormState = { error?: string; ok?: boolean } | null;

export async function submitReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const session = await requireUser();
  const productId = String(formData.get("productId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const result = await submitReview(
    productId,
    { rating: Number(formData.get("rating")), body: String(formData.get("body") ?? "") },
    session,
  );
  if ("error" in result) {
    return {
      error:
        result.error === "INVALID"
          ? "Rating 1-5 wajib dipilih dan isi ulasan tidak boleh kosong (maks 2000 karakter)."
          : "Silakan masuk terlebih dahulu.",
    };
  }
  revalidatePath(`/produk/${slug}`);
  return { ok: true };
}
```

- [ ] **Step 2: Buat `src/components/review-form.tsx`**

```tsx
"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { submitReviewAction, type ReviewFormState } from "@/server/actions/storefront";

type Props = { productId: string; slug: string; existing: { rating: number; body: string } | null };

export function ReviewForm({ productId, slug, existing }: Props) {
  const [state, formAction, pending] = useActionState(submitReviewAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4 border-t border-olive/15 pt-6">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <h3 className="text-xs font-semibold uppercase tracking-widest">{existing ? "Perbarui ulasanmu" : "Tulis ulasan"}</h3>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className="cursor-pointer">
            <input type="radio" name="rating" value={i} defaultChecked={existing?.rating === i} required className="peer sr-only" />
            <span
              aria-hidden
              className="text-xl text-olive/25 peer-checked:text-olive peer-focus-visible:outline-2 peer-focus-visible:outline-olive"
            >
              ★
            </span>
          </label>
        ))}
      </div>
      <textarea
        name="body"
        required
        maxLength={2000}
        rows={4}
        defaultValue={existing?.body ?? ""}
        placeholder="Bagaimana pengalamanmu dengan produk ini?"
        className="border border-olive/25 bg-transparent p-3 text-sm focus:outline-2 focus:outline-olive"
      />
      <div className="flex flex-wrap items-center gap-4">
        <button
          disabled={pending}
          className="rounded-full border border-olive px-6 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime disabled:opacity-40"
        >
          {existing ? "Perbarui ulasan" : "Kirim ulasan"}
        </button>
        {state?.error && <p className="text-sm font-semibold">{state.error}</p>}
        {state?.ok && <p className="text-sm">Ulasan tersimpan.</p>}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Buat `src/components/storefront/reviews-section.tsx`**

```tsx
import { ReviewForm } from "@/components/review-form";
import { Stars } from "@/components/storefront/stars";
import { getOwnReview, getReviewSummary, listReviews } from "@/server/domain/reviews";

const tanggal = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

type Props = { productId: string; slug: string; userId: string | null };

export async function ReviewsSection({ productId, slug, userId }: Props) {
  const [summary, reviews, own] = await Promise.all([
    getReviewSummary(productId),
    listReviews(productId),
    userId ? getOwnReview(productId, userId) : Promise.resolve(null),
  ]);
  return (
    <section id="ulasan" className="reveal-scroll flex flex-col gap-8">
      <h2 className="text-xs font-semibold uppercase tracking-widest">Ulasan Pelanggan</h2>
      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
        <div>
          <p className="text-6xl font-extrabold tracking-tight">{summary.average.toFixed(1).replace(".", ",")}</p>
          <div className="mt-1 flex items-center gap-2">
            <Stars value={summary.average} />
            <span className="text-sm opacity-70">{summary.count} ulasan</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-xs">
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star} className="flex items-center gap-3">
              <span className="w-3 text-right">{star}</span>
              <div className="h-2 flex-1 bg-olive/10">
                <div
                  className="h-full bg-lime"
                  style={{ width: `${summary.count > 0 ? (summary.distribution[star - 1] / summary.count) * 100 : 0}%` }}
                />
              </div>
              <span className="w-8 opacity-60">{summary.distribution[star - 1]}</span>
            </div>
          ))}
        </div>
      </div>
      {reviews.length === 0 ? (
        <p className="text-sm opacity-70">Belum ada ulasan untuk produk ini.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-olive/15 pb-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-semibold">{r.userName}</p>
                <time className="text-xs opacity-60">{tanggal.format(r.createdAt)}</time>
              </div>
              <Stars value={r.rating} className="mt-1" />
              <p className="mt-2 text-sm leading-relaxed">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      {userId ? (
        <ReviewForm productId={productId} slug={slug} existing={own ? { rating: own.rating, body: own.body } : null} />
      ) : (
        <p className="text-sm">
          Punya produk ini?{" "}
          <a className="underline underline-offset-4" href={`/login?next=/produk/${slug}`}>
            Masuk untuk menulis ulasan
          </a>
          .
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Pasang di halaman**

Di `app/(shop)/produk/[slug]/page.tsx`: tambah import `import { ReviewsSection } from "@/components/storefront/reviews-section";` dan `import { getCurrentSession } from "@/server/session";`, kembalikan `getCurrentSession()` ke `Promise.all`:

```tsx
  const [summary, sameCategory, session] = await Promise.all([
    getReviewSummary(product.id),
    listProducts({ categorySlug: product.categorySlug }),
    getCurrentSession(),
  ]);
```

lalu sisipkan setelah `<SizeChartSection ... />`:

```tsx
      <ReviewsSection productId={product.id} slug={product.slug} userId={session?.userId ?? null} />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/storefront.ts src/components/review-form.tsx src/components/storefront/reviews-section.tsx "app/(shop)/produk/[slug]/page.tsx"
git commit -m "feat: add review summary, list, and write/update form"
```

---

### Task 9: Verifikasi penuh — suite, build, dan golden path browser

**Files:**
- Tidak ada file baru; perbaikan kecil bila verifikasi menemukan masalah.

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: bukti verifikasi (output command + checklist browser).

- [ ] **Step 1: Jalankan seluruh suite test**

Run: `npm test`
Expected: semua test PASS (unit + integrasi, termasuk reviews dan catalog baru).

- [ ] **Step 2: Build produksi**

Run: `npm run build`
Expected: build sukses tanpa error type/lint.

- [ ] **Step 3: Golden path browser**

Run: `npm run dev`, lalu dengan browser cek `http://localhost:3000/produk/kaus-lengan-panjang`:

1. Breadcrumb `Beranda / Pria / Kaus Lengan Panjang Krease` tampil dan link kategori bekerja.
2. Galeri: thumbnail ada; klik thumbnail mengganti gambar utama; ganti warna mengganti set gambar dan mereset thumbnail.
3. CTA terlihat sejak awal dengan teks "Pilih warna & ukuran dulu" dan disabled; setelah pilih warna+ukuran menjadi "Tambah ke Tas" aktif + stok tampil; klik menambah ke tas (redirect `/cart`) — ini regresi `VariantPicker`.
4. Bar rating di panel beli menampilkan rata-rata seed (link ke `#ulasan` bekerja).
5. Seksi Fitur + tabel Material/Perawatan tampil; tabel ukuran pria tampil dengan diagram bernomor dan chip fit lime; link "Panduan ukuran" scroll ke `#tabel-ukuran`.
6. Seksi ulasan: angka besar, bar distribusi, 4 ulasan seed terurut terbaru; sebagai guest terlihat link "Masuk untuk menulis ulasan".
7. Login sebagai `customer@demo.id` / `customer1234`, kembali ke produk: form "Tulis ulasan" tampil; kirim rating 4 + body → ringkasan, distribusi, dan daftar berubah tanpa reload manual; kirim lagi → form berubah jadi "Perbarui ulasan" ter-pre-fill dan jumlah ulasan tidak bertambah.
8. Produk `celana-pleats-pria` (ukuran 28/30/32): seksi tabel ukuran tidak tampil, seksi lain normal. Produk `tas-tote-kulit`: tabel ukuran tas tampil dengan unit cm dan 2 ulasan seed.
9. Halaman `/` dan `/kategori/pria` tidak berubah (regresi kartu produk).

- [ ] **Step 4: Perbaiki bila ada temuan, ulangi step 1-3, lalu commit**

```bash
git add -A
git commit -m "fix: address PDP verification findings"
```

(Lewati commit ini bila tidak ada perubahan.)
