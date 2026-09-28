# Design Spec: Redesign Halaman Detail Produk (PDP)

Tanggal: 2026-09-28
Status: disetujui lewat brainstorming (layout, data, ulasan, visual, testing per seksi)

## Latar belakang

Halaman detail produk (`app/(shop)/produk/[slug]/page.tsx`) saat ini terlalu kosong: grid dua kolom dengan galeri tanpa thumbnail, nama, harga, dan deskripsi satu kalimat; kolom kanan kosong di bawah deskripsi. Tidak ada rating, ulasan, spesifikasi terstruktur, tabel ukuran, maupun produk terkait. Model data hanya punya `Product.description` (string tunggal) dan tidak ada model `Review`.

Tujuan: mengisi halaman dengan informasi nyata yang membantu keputusan membeli — deskripsi detail, spec, tabel ukuran per kategori, rating & ulasan yang bisa ditulis user — tanpa kehilangan fokus konversi dan tanpa keluar dari identitas visual toko (krem/olive/lime, Archivo, label uppercase).

## Scope

**In scope**

- Redesign PDP dengan layout "Editorial commerce" (opsi A).
- Field produk terstruktur baru: material, perawatan, fit, daftar fitur (DB + seed).
- Tabel ukuran per kategori sebagai konstanta typed di kode.
- Model `Review` + alur tulis/perbarui ulasan untuk user login + agregasi rating.
- Seed diperkaya (deskripsi, specs, ulasan).
- Test integrasi untuk domain ulasan dan size chart; verifikasi manual via browser.

**Out of scope**

- Moderasi ulasan di admin, badge "verified purchase", pagination daftar ulasan, hapus ulasan.
- Editing field produk baru lewat form admin (scope admin v2 sudah terkunci di spec terpisah).
- Tabel ukuran sebagai data DB (category CRUD masih deferred; lihat switch point).

## Arsitektur data

### Perubahan schema (`prisma/schema.prisma`, migrasi baru)

```prisma
model Product {
  // ...field existing...
  material         String?
  careInstructions String?
  fit              String?
  features         String[]
  reviews          Review[]
}

model User {
  // ...field existing...
  reviews Review[]
}

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

- Semua field produk baru nullable/opsional supaya produk lama dan input admin tetap valid; UI menyembunyikan bagian yang datanya kosong.
- `@@unique([productId, userId])`: satu ulasan per user per produk; tulis ulang = upsert (perbarui), bukan duplikat. Tidak ada fitur hapus ulasan.
- Relasi ke `User` memakai aksi default (user tidak pernah dihapus di app ini).

### Domain ulasan (`src/server/domain/reviews.ts`)

Mengikuti gaya repo: fungsi domain menerima `Session | null` dan mengembalikan result object; server action hanya wrapper tipis.

- `getReviewSummary(productId): Promise<{ average: number; count: number; distribution: number[] }>` — satu query `groupBy(rating)` + `_count`; rata-rata dihitung di JS dari distribusi (tanpa `$queryRaw`, konsisten dengan gaya repo). `distribution` array 5 slot, indeks 0 = bintang 1. Produk tanpa ulasan: `{ average: 0, count: 0, distribution: [0,0,0,0,0] }`.
- `listReviews(productId)` — urut `createdAt` desc, include nama user; render semua (skala demo).
- `submitReview(productId, { rating, body }, session)` — error `"UNAUTHENTICATED"` tanpa session, `"INVALID"` untuk rating di luar 1–5 atau body kosong/setelah trim; selain itu upsert pada `(productId, userId)`.

Server action `submitReviewAction` di `src/server/actions/storefront.ts`: ambil session dari `getCurrentSession`, panggil domain, `revalidatePath` path produk supaya ringkasan, daftar, dan bar rating panel beli ikut berubah.

### Tabel ukuran (`src/lib/size-charts.ts`)

Konstanta typed keyed by category slug:

```ts
type SizeChart = {
  kind: "apparel" | "bag" | "eyewear" | "beanie";
  columns: string[];                 // nama titik ukur, dipakai juga sebagai label bernomor
  rows: { size: string; values: number[] }[];
  measureNote: string;
};
```

- `pria` & `wanita` (kind apparel): kolom Lingkar Dada, Panjang Badan, Bahu, Lengan (cm).
- `tas`: Lebar, Tinggi, Depth, Drop Strap.
- `kacamata`: Lensa, Bridge, Temple.
- `beanie`: Lingkar Kepala, Tinggi.
- Slug tak dikenal → `undefined` → seksi tabel ukuran tidak dirender.
- Diagram SVG cara mengukur hanya untuk `kind: "apparel"`; kategori lain tampil tabel + `measureNote` saja.

### Seed (`prisma/seed.ts`)

- 12 produk diisi `material`, `careInstructions`, `fit` (termasuk catatan model, mis. "Regular fit. Model 187 cm memakai ukuran M"), `features` (3–5 poin), dan deskripsi diperpanjang jadi 2–3 kalimat.
- Karena seed awal hanya punya dua user, seed menambah delapan user reviewer (nama Indonesia, email `reviewerN@demo.id`, password sama dengan customer demo) sebagai penulis ulasan: distribusi natural (mayoritas 4–5, beberapa 3), copy bahasa Indonesia, tanggal tersebar beberapa bulan terakhir, deterministik.

## Struktur halaman & komponen

Orkestrasi di `page.tsx` (RSC): `Promise.all` dari `getProductBySlug` (include category untuk slug kategori), `getReviewSummary`, dan `listProducts` kategori sama (exclude produk yang sedang ditampilkan, ambil 4) untuk produk terkait.

Urutan render:

1. **Breadcrumb** — Beranda / Kategori / Nama produk; link server-side polos.
2. **Grid atas `md:grid-cols-[1.1fr_1fr]`**
   - `ProductGallery` (client, komponen baru): gambar utama aspect 4/5 + baris thumbnail `<button>` (klik mengganti gambar utama; filter gambar per warna seperti perilaku sekarang; `aria-current` pada thumbnail aktif).
   - `BuyPanel` (server, `md:sticky top-24 self-start`): nama produk, bar rating (bintang olive + rata-rata + "(N ulasan)", anchor `#ulasan`), harga, deskripsi penuh (2–3 kalimat), pemilih warna/ukuran, CTA, stok, microcopy tetap "Dikirim dalam 2 hari kerja · Retur 14 hari selama belum dipakai".
   - `VariantPicker` (client, direvisi): CTA **selalu terlihat** dan disabled sampai warna+ukuran dipilih (teks helper pindah ke dalam tombol/area CTA, bukan menggantikan form); baris ukuran mendapat link "Panduan ukuran" anchor `#tabel-ukuran`; perilaku reset ukuran saat ganti warna dipertahankan.
3. **Detail & Perawatan** — dua kolom: daftar fitur (`features`) kiri, tabel spec (Material, Perawatan) kanan. Deskripsi tidak diulang di sini.
4. **Tabel Ukuran (`#tabel-ukuran`)** — "measurement sheet": tabel mono dengan kolom bernomor, diagram SVG apparel dengan titik ukur bernomor yang sama, chip lime catatan fit/model (dari `fit`), `measureNote` italic.
5. **Ulasan (`#ulasan`)** — blok ringkasan (angka rata-rata satu desimal dalam Archivo extrabold, barisan bintang olive diisi sesuai `Math.round(average)`, jumlah ulasan, distribusi 5 bar lime di atas track olive transparan + angka per bintang), daftar ulasan (nama, bintang ulasan, tanggal format Indonesia, isi), lalu form/ajakan sesuai state (lihat bawah). Bar rating kecil di BuyPanel memakai aturan pembulatan bintang yang sama.
6. **Produk Terkait** — 4 kartu kategori sama, reuse komponen kartu produk yang sudah dipakai halaman home/kategori.

Pemisahan server/client: pulau client hanya `ProductGallery`, `VariantPicker` (revisi), dan `ReviewForm`. Sisanya RSC murni.

### State form ulasan (`ReviewForm`, client)

- Belum login → area form diganti kalimat ajakan + link "Masuk untuk menulis ulasan" yang mengarah ke login dengan redirect kembali ke halaman produk ini.
- Login, belum punya ulasan → form kosong (radio bintang 1–5 wajib, textarea body wajib maks 2000 karakter), tombol "Kirim ulasan".
- Login, sudah punya ulasan → form ter-pre-fill ulasan sendiri, tombol "Perbarui ulasan".
- Error validasi/auth ditampilkan inline via `useActionState`; user suspended tertolak oleh check DB-backed di `requireUser`.

## Bahasa visual

- Token existing dipakai apa adanya: cream `#f4f6ec`, olive `#2f3b22`, lime `#c8f169`, sage `#a9c3a2`, card `#ececec`; hairline = olive transparan.
- Bintang rating diisi **olive** (bukan emas); bar distribusi lime; chip fit lime dengan teks olive.
- Tipografi satu keluarga Archivo dengan tiga role: extrabold uppercase (display: nama produk, judul seksi), regular (body), semibold uppercase tracking-widest (micro-label). Role utility/data: font mono untuk angka tabel ukuran dan kolom numerik. Tidak menambah font baru.
- Motion: reuse `.reveal-scroll` existing untuk seksi bawah lipatan (sudah menghormati `prefers-reduced-motion`); tidak menambah keyframe baru.
- Elemen signature: measurement sheet tabel ukuran dengan diagram garis SVG bertitik ukur bernomor.

## Error handling

- Slug tidak ditemukan / produk non-aktif → `notFound()` (perilaku existing dipertahankan).
- `submitReview` gagal → pesan inline di form; tidak ada toast global.
- Kategori tanpa size chart atau produk tanpa `features`/`material` → seksi terkait tidak dirender (bukan blok kosong).
- Race dua tab saat submit → upsert membuat submit kedua menjadi update, bukan error.

## Testing & verifikasi

**Test integrasi `tests/integration/reviews.test.ts`** (pola `admin-catalog.test.ts`: `cleanDb`, factories `makeUser`/`makeProduct`, session literal):

1. `submitReview` tanpa session → `{ error: "UNAUTHENTICATED" }`.
2. Rating di luar 1–5 atau body kosong → `{ error: "INVALID" }`.
3. Upsert: submit kedua user sama mengubah baris yang itu (jumlah ulasan tetap 1, isi berubah).
4. `getReviewSummary`: rata-rata dan distribusi benar; produk tanpa ulasan → nol semua.
5. `listReviews`: urut terbaru dan membawa nama user.

**Test `size-charts`** — chart untuk slug yang ada (pria, wanita, tas, kacamata, beanie) konsisten (jumlah kolom = panjang `values` tiap baris); slug tak dikenal → `undefined`.

**Verifikasi manual (dev server + browser)** — golden path: semua seksi render; pilih warna+ukuran mengaktifkan CTA; tambah ke tas bekerja (regresi `VariantPicker`); login → kirim ulasan → ringkasan dan bar rating panel beli berubah; perbarui ulasan sendiri; produk tanpa fitur/chart menyembunyikan seksi terkait dengan rapi; halaman kategori dan cart tidak berubah.

**Gate akhir** — `vitest run` hijau dan typecheck/build hijau.

## Switch points (dicatat, tidak dikerjakan sekarang)

- Daftar ulasan dirender semua; tambah pagination/"tampilkan selengkapnya" kalau jumlah ulasan per produk mulai panjang.
- Size chart pindah ke DB (editable admin) jika category CRUD benar-benar dikerjakan di admin.
- Agregasi rating tetap satu `groupBy`; tidak perlu raw SQL pada skala demo.
