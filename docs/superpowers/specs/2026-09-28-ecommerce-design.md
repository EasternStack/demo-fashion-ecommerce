# Design Spec: E-Commerce End-to-End Demo ("Easternstack Store")

- Tanggal: 2026-09-28
- Status: Disetujui user (brainstorming selesai 2026-09-28)
- Referensi desain: `design-reference/*.webp` (mockup landing page "Linea Fashion")

## 1. Tujuan

Website e-commerce fungsional end-to-end sebagai demo: pelanggan dapat menjelajah katalog, mendaftar/login, berbelanja, membayar lewat payment gateway tiruan, dan melacak pengiriman; admin dapat mengelola produk, stok per varian, dan memproses pesanan. Payment dan delivery sengaja dummy (mock) tetapi dibangun di belakang interface agar nanti bisa diganti implementasi nyata tanpa merombak checkout.

## 2. Scope

### In-scope

1. Storefront customer-facing: home, halaman kategori, halaman produk (PDP), pencarian, cart, checkout.
2. Akun: register + login customer (email/password), login admin role-based; riwayat & detail pesanan customer.
3. Payment dummy: halaman mock gateway di dalam app dengan aturan hasil deterministik; record pembayaran berstatus.
4. Delivery dummy: pipeline status pesanan yang digeser admin, nomor resi dari modul courier tiruan, timeline tracking untuk customer.
5. Admin: CRUD produk dengan matriks varian warna × ukuran dan stok per kombinasi; order management (list, detail, transisi status, cancel + restore stok).
6. Seed data: akun demo, 5 kategori, 12–16 produk bervarian dengan gambar hasil generate.
7. Testing: Vitest untuk logika kritis + verifikasi manual via browser.

### Out-of-scope (eksplisit)

- Integrasi payment gateway / kurir nyata.
- Kupon/diskon, wishlist fungsional, review produk, manajemen kategori via admin (kategori hanya dari seed).
- ~~Dashboard analitik admin~~ — **dicabut 2026-09-28**, lihat `2026-09-28-admin-console-design.md`.
- Cancel pesanan oleh customer (cancel hanya dari admin).
- Guest checkout (checkout wajib login).
- Deploy/production hosting (demo lokal-first; kode tidak menghalangi deploy nanti).

## 3. Tech stack

- Next.js 15 (App Router, TypeScript) untuk FE dan BE dalam satu app.
- PostgreSQL via `docker-compose.yml` (dua database: app + test).
- Prisma ORM (migrasi + seed).
- Tailwind CSS + CSS variables untuk design token; tanpa component library berat.
- `jose` untuk JWT session; `scrypt` dari `node:crypto` untuk hash password (tanpa dependency auth eksternal).
- Vitest untuk test.

## 4. Arsitektur & struktur app

Monolith Next.js App Router. Halaman = React Server Components yang membaca lewat modul domain. Semua mutasi = Server Actions tipis (validasi input → panggil domain → `revalidatePath`). Logika bisnis hidup di `src/server/domain/*`, tidak di komponen dan tidak di Server Actions.

```
app/
  (storefront)/            # /, /kategori/[slug], /produk/[slug], /cari
  (auth)/                  # /login, /register
  cart/                    # /cart
  checkout/                # /checkout
  payment/[orderCode]/     # halaman mock gateway
  akun/pesanan/            # /akun/pesanan, /akun/pesanan/[orderCode]
  admin/                   # layout guard requireAdmin()
    produk/                # list, /baru, /[id]/edit
    pesanan/               # list, /[orderCode]
  uploads/[...path]/route.ts   # serve file dari var/uploads/
src/server/
  db.ts                    # Prisma client singleton
  session.ts               # issue/read JWT cookie, requireUser(), requireAdmin()
  domain/
    catalog.ts             # kategori, produk, varian, search
    cart.ts                # cart per user, ubah qty, validasi stok
    orders.ts              # createOrder, transisiStatus, cancelOrder
    payments/
      index.ts             # interface PaymentProvider
      mock-gateway.ts      # implementasi mock
    shipping/
      index.ts             # interface ShippingProvider
      mock-courier.ts      # implementasi mock (generate resi)
  actions/
    storefront.ts          # Server Actions area customer
    admin.ts               # Server Actions area admin
src/components/            # ProductCard, VariantPicker, StatusChip, Timeline, dsb.
src/lib/
  order-status.ts          # enum + peta transisi valid
  format.ts                # formatIDR (Intl.NumberFormat id-ID)
prisma/schema.prisma
prisma/seed.ts
public/images/products/    # gambar hasil generate (static)
var/uploads/               # upload gambar admin saat runtime
docker-compose.yml
.env.example
```

Keputusan kunci:

- **Interface provider**: `PaymentProvider` dan `ShippingProvider` membatasi kode mock; ganti ke provider nyata nanti = menambah implementasi baru, bukan mengubah checkout/order.
- **Snapshot ke order**: nama produk, label varian, harga satuan, dan alamat pengiriman disalin ke order/order-item saat order dibuat, sehingga riwayat tidak berubah walau produk/alamat diedit kemudian.
- **Upload ke `var/uploads/`**, disajikan lewat Route Handler `/uploads/[...path]`; bukan ke `public/` karena `public/` read-only pada deployment production.

## 5. Data model (Prisma)

- **User**: `id, email unique, passwordHash, name, role enum(CUSTOMER, ADMIN), createdAt`.
- **Address**: `id, userId FK, recipient, phone, line1, city, province, postalCode, isDefault Boolean`.
- **Category**: `id, name, slug unique`.
- **Product**: `id, categoryId FK, name, slug unique, description, basePrice Int (rupiah penuh), images String[] (path), isActive Boolean, createdAt`.
- **ProductVariant**: `id, productId FK, colorName, colorHex, size, stock Int, sku unique`; constraint `unique(productId, colorName, size)`. Stok hidup di tabel ini.
- **Cart**: `id, userId FK unique`. **CartItem**: `id, cartId FK, variantId FK, qty Int`; `unique(cartId, variantId)`.
- **Order**: `id, code unique (format ESV-YYYYMMDD-XXXX dengan XXXX = 4 karakter alfanumerik acak), userId FK, status enum, subtotal Int, shippingCost Int, total Int, snapshot alamat: shipRecipient, shipPhone, shipLine1, shipCity, shipProvince, shipPostalCode, createdAt`.
- **OrderItem**: `id, orderId FK, variantId FK, productName, variantLabel, unitPrice Int, qty Int` (snapshot).
- **Payment**: `id, orderId FK unique, provider String ('mock'), method String, status enum(PENDING, SUCCESS, FAILED), last4 String?, paidAt DateTime?`. Satu record per order: percobaan bayar ulang (retry) memperbarui record yang sama, bukan membuat baris baru.
- **Shipment**: `id, orderId FK unique, carrier String ('Mock Express'), trackingNumber String, createdAt`.
- **OrderEvent**: `id, orderId FK, status enum(OrderStatus), note String?, createdAt` — sumber timeline tracking.

Enum **OrderStatus**: `PENDING, PAID, PROCESSING, SHIPPED, DELIVERED, CANCELLED`.

Peta transisi valid (di `src/lib/order-status.ts`, satu-satunya sumber kebenaran):

- `PENDING → PAID` (hanya via konfirmasi payment sukses)
- `PAID → PROCESSING`, `PROCESSING → SHIPPED`, `SHIPPED → DELIVERED` (admin)
- `PENDING → CANCELLED`, `PAID → CANCELLED`, `PROCESSING → CANCELLED` (admin; restore stok)
- Transisi di luar peta ditolak oleh domain (error), termasuk `SHIPPED/DELIVERED → CANCELLED`.

Aturan stok:

- `createOrder` mengurangi stok semua item dalam satu transaksi Prisma dengan conditional update (`UPDATE ... SET stock = stock - qty WHERE id = ... AND stock >= qty`); bila affected row tidak sesuai, rollback + error "stok tidak mencukupi".
- `cancelOrder` menambah kembali stok dalam transaksi yang sama dengan perubahan status.
- Stok dicek ulang saat add-to-cart dan saat checkout (render maupun action).

## 6. Flow customer

1. **Browse**: `/` (home sesuai struktur mockup: header + nav kategori, hero uppercase + CTA, banner besar, carousel produk per kategori, strip banner kategori, section produk, banner promo, testimonial, footer newsletter dummy). `/kategori/[slug]` grid product card (gambar, nama, harga IDR, swatch warna, tombol "Tambah ke Tas" saat hover). `/cari?q=` pencarian nama produk (Prisma `contains`, case-insensitive).
2. **PDP `/produk/[slug]`**: galeri gambar per warna, picker warna (swatch) & ukuran (chip), indikator stok varian (varian stok 0 → disabled), qty, tambah ke keranjang.
3. **Cart `/cart`**: list item varian dengan qty stepper & hapus; ringkasan subtotal, ongkir flat dummy Rp15.000, total; CTA checkout (wajib login; belum login → redirect `/login?next=/checkout`).
4. **Checkout `/checkout`**: pilih alamat tersimpan atau isi alamat baru (tersimpan bila dicentang); ringkasan item; tombol "Buat Pesanan" → Server Action: transaksi membuat Order `PENDING` + OrderItem snapshot + decrement stok + Payment `PENDING` + OrderEvent(`PENDING`), kosongkan cart, redirect `/payment/[orderCode]`.
5. **Payment `/payment/[orderCode]`** (mock gateway "MockPay"): ringkasan tagihan + form nomor kartu, expiry, CVC. Validasi format inline. Aturan deterministik: nomor kartu berakhiran `0002` → declined; lainnya sukses. Submit → state "memproses" ±2 detik → Server Action confirm: sukses ⇒ Payment `SUCCESS` + paidAt, order `PAID` + OrderEvent, redirect halaman konfirmasi; gagal ⇒ Payment `FAILED`, order tetap `PENDING`, tampilkan pesan + tombol coba lagi (retry memperbarui Payment record yang sama) serta link ke detail pesanan; pembatalan pesanan hanya tersedia dari admin.
6. **Tracking**: `/akun/pesanan` daftar pesanan (code, tanggal, status chip, total). `/akun/pesanan/[orderCode]` detail: item, alamat, info payment (provider, last4, status), timeline dari OrderEvent, dan resi + carrier setelah shipped.

Copy UI seluruhnya bahasa Indonesia; semua harga `Int` rupiah diformat `Intl.NumberFormat('id-ID')` (Rp89.900).

## 7. Flow admin

Guard ganda: `app/admin/layout.tsx` memanggil `requireAdmin()` (redirect `/login?next=...` bila gagal) DAN setiap Server Action admin memanggil `requireAdmin()` di dalamnya.

1. **/admin/produk**: tabel (thumb, nama, kategori, harga, total stok semua varian, status aktif) + aksi edit / nonaktifkan; tombol produk baru.
2. **Form produk** (`/admin/produk/baru`, `/admin/produk/[id]/edit`): nama, slug auto-generate, kategori select, deskripsi, harga, upload gambar multipart (beberapa file → `var/uploads/`, preview, hapus), editor matriks varian: daftar warna (nama + hex) × daftar ukuran menghasilkan grid input stok per sel; sel kosong = varian tidak dibuat. Varian yang pernah terjual tidak dapat dihapus (stok boleh di-set 0) agar riwayat order valid.
3. **/admin/pesanan**: tab filter per status; tabel code, customer, tanggal, total, status chip.
4. **/admin/pesanan/[orderCode]**: detail item + snapshot, alamat, payment, resi/carrier, timeline OrderEvent, dan tombol aksi yang hanya menampilkan transisi valid dari status kini: `Proses` (PAID→PROCESSING), `Kirim` (PROCESSING→SHIPPED; membuat Shipment + resi dari mock courier + OrderEvent), `Tandai Diterima` (SHIPPED→DELIVERED), `Batalkan` (PENDING/PAID/PROCESSING→CANCELLED; restore stok). Aksi lewat Server Action dengan dialog konfirmasi di UI.

`isActive=false` menyembunyikan produk dari storefront & pencarian tanpa menghapus data.

## 8. Auth & session

- Cookie httpOnly `esv_session`, JWT HS256 via `jose`, payload `{ userId, role }`, expiry 7 hari; secret dari env `SESSION_SECRET`.
- Password hash `scrypt` + salt acak; verifikasi timing-safe.
- `requireUser()` / `requireAdmin()` di `src/server/session.ts`; dipakai layout terproteksi dan semua Server Actions yang butuh auth.
- Register membuat role CUSTOMER dan langsung login. Akun ADMIN hanya dari seed.

## 9. Error handling

- Server Actions mengembalikan union `{ error: string } | { ok: true, ... }`; form menampilkan pesan inline, bukan `alert`.
- Slug produk/kategori dan order code tidak ditemukan → `notFound()`.
- Kekurangan stok (race maupun stale cart) → pesan "stok tidak mencukupi" pada cart/checkout; item cart dengan varian yang sudah tidak aktif ditandai di halaman cart.
- Payment decline → tetap di halaman gateway dengan pesan dan opsi coba lagi.
- Error tak terduga dibiarkan ke error page default Next.js (tidak ada error boundary custom).

## 10. Testing

Vitest:

- Unit (logika murni): peta transisi status menolak transisi invalid; aturan decline mock gateway (akhiran 0002, format invalid); format IDR.
- Integration (DB test via `TEST_DATABASE_URL`, migrate di vitest globalSetup, transaksi/cleanup per test): `createOrder` mengurangi stok dan rollback saat stok kurang; `cancelOrder` merestore stok; transisi status invalid ditolak; Server Action admin ditolak untuk session role CUSTOMER; payment sukses mengubah order ke PAID dan gagal membiarkan PENDING.
- Verifikasi manual via browser saat development: golden path browse → cart → checkout → payment → tracking, dan loop admin (produk baru → pesanan diproses → delivered).

## 11. Seed & env

- `prisma/seed.ts`: admin `admin@demo.id / admin1234`; customer `customer@demo.id / customer1234`; 5 kategori sesuai nav mockup (Pria, Wanita, Tas, Kacamata, Beanie); 12–16 produk, masing-masing 2–3 warna × 2–4 ukuran dengan stok masuk akal; gambar dari `public/images/products/` (hasil generate ImageGen saat implementasi).
- `.env.example`: `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`.
- `docker-compose.yml`: service `postgres` (port 5432, db `ecommerce`) dan `postgres-test` (port 5433, db `ecommerce_test`).
- Script npm: `dev`, `db:up`, `db:migrate`, `db:seed`, `test`.

## 12. Arah visual

Token diambil dari mockup: background cream `#F4F6EC`; aksen lime `#C8F169` dan sage; teks olive gelap `#2F3B22`; card produk abu-abu terang `#ECECEC`; headline sans-serif uppercase berat dan rapat (Archivo / Inter Tight); tombol pill outline dengan ikon panah; nav kategori huruf kapital kecil-ukuran; footer multi-kolom dengan form newsletter. Layout responsif: grid 3–4 kolom di desktop, 2 kolom tablet, 1–2 kolom mobile.

## 13. Asumsi & batasan

- Demo lokal-first; `var/uploads/` berasumsi filesystem writable (benar di dev & server self-host; tidak di platform serverless read-only).
- Ongkir flat Rp15.000 (dummy), tanpa perhitungan berat/wilayah.
- Tidak ada email/notifikasi keluar.
- concurrency: demo single-node; perlindungan oversell mengandalkan transaksi DB (cukup untuk beban demo).
