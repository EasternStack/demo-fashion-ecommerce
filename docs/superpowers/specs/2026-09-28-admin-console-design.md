# Design Spec: Admin Console v2 (Dashboard, User Management, Shell)

- Tanggal: 2026-09-28
- Status: Disetujui user (brainstorming selesai 2026-09-28)
- Menggantikan sebagian: `docs/superpowers/specs/2026-09-28-ecommerce-design.md` — spec lama menulis "dashboard analitik admin" sebagai out-of-scope; keputusan itu dicabut oleh dokumen ini.

## 1. Tujuan

Area admin repo ini saat ini hanya dua modul (produk dan pesanan) dengan shell sidebar tiga tautan, dan `/admin` sekadar melakukan `redirect("/admin/produk")`. Spec ini membangunnya menjadi admin console yang layak: dashboard metrik, manajemen pengguna, dan shell yang rapat dan responsif — tanpa memperkenalkan pola arsitektur kedua ke dalam codebase.

## 2. Keputusan yang terkunci dari brainstorming

| Topik | Keputusan |
|---|---|
| Scope | Dashboard + User Management + Admin shell/UX |
| Aksi user management | detail, promote/demote role, suspend/activate, reset password |
| Enforcement suspend & role | cek DB di `requireUser()` / `requireAdmin()` |
| Chart | `recharts` (dependensi baru) |
| Arah visual | "Satu bahasa dengan toko" — body cream, sidebar olive gelap, aksen lime, surface `--color-card` |
| Pendekatan arsitektur | RSC-first, ikuti pola domain-module yang sudah ada |

## 3. Scope

### In-scope

1. Dashboard `/admin` dengan 4 KPI, 2 chart recharts, top produk, alert stok menipis, dan pesanan terbaru.
2. Manajemen pengguna: list dengan search/filter/pagination, halaman detail, promote/demote, suspend/activate, reset password.
3. Admin shell baru: sidebar dengan active state, topbar dengan breadcrumb dan identitas admin, lipatan responsif tanpa JavaScript.
4. Search + pagination untuk tabel produk dan pesanan yang sudah ada.
5. Enforcement suspend dan perubahan role terhadap sesi JWT yang masih hidup.
6. Migrasi satu kolom baru: `User.suspendedAt`.

### Out-of-scope (eksplisit)

- CRUD kategori, modul inventory / `StockMovement`, bulk action.
- Kupon/diskon, audit log, export CSV.
- Sorting kolom tabel (hanya urutan default).
- Hapus user. `Order.userId` tidak punya `onDelete: Cascade`, jadi hard delete akan gagal atau menghasilkan orphan; soft delete memaksa seluruh query storefront menyaring `deletedAt`. Tidak sepadan untuk nilai demo.
- Auto-refresh / real-time dashboard.
- Pencabutan sesi saat reset password (lihat §9).

## 4. Arsitektur

Pendekatan yang dipilih adalah **RSC-first mengikuti pola repo apa adanya**. Dua modul domain baru meniru `admin-catalog.ts` persis: terima `actor: Session | null`, panggil `assertRole`, kembalikan `data | { error: string }`. Halaman tetap React Server Component. Client component hanya untuk dua hal yang memang wajib: chart recharts, dan tombol aksi.

Dua pendekatan yang ditolak:

- **`<DataTable>` generik config-driven.** Ketiga tabel punya karakter kolom dan aksi yang berbeda (produk punya `ToggleActiveButton`, pesanan punya `StatusChip`, pengguna punya tiga aksi). Abstraksinya akan bocor lewat prop-prop khusus, dan aksi harus berupa client component sehingga sulit dirender dari dalam tabel RSC. Untuk tiga tabel, ini abstraksi prematur.
- **Admin client-heavy (SPA-ish).** Paling responsif, tetapi mematahkan arsitektur RSC + server actions, membutuhkan layer data-fetching baru, memaksa auth dicek dua kali, dan membuat test jauh lebih berat.

### Struktur file

```
app/admin/
  layout.tsx                       UBAH  render <AdminShell>, bukan sidebar statis
  page.tsx                         UBAH  dashboard (sekarang cuma redirect)
  pengguna/page.tsx                BARU  list + search + filter role/status + pagination
  pengguna/[id]/page.tsx           BARU  detail user
  produk/page.tsx                  UBAH  tambah search + pagination
  pesanan/page.tsx                 UBAH  tambah search + pagination + signature baru

src/server/domain/admin-analytics.ts   BARU  metrik dashboard
src/server/domain/admin-users.ts       BARU  list, detail, role, suspend, reset password
src/server/actions/admin-users.ts      BARU  server actions tipis
src/lib/pagination.ts                  BARU  parsePage, parseQuery, pageSlice, PAGE_SIZE

src/components/admin/
  admin-shell.tsx          BARU  "use client" — sidebar + topbar + breadcrumb
  action-button.tsx        BARU  "use client" — tombol aksi generik + toast error
  reset-password-form.tsx  BARU  "use client" — input password baru
  search-form.tsx          BARU  server — GET form pencarian
  table-pager.tsx          BARU  server — link pagination berbasis searchParams
  kpi-card.tsx             BARU  server
  revenue-chart.tsx        BARU  "use client" — recharts AreaChart
  status-donut.tsx         BARU  "use client" — recharts PieChart
  chart-palette.ts         BARU  konstanta hex untuk chart
  toggle-active-button.tsx UBAH  dibangun ulang di atas ActionButton
  transition-buttons.tsx   UBAH  dibangun ulang di atas ActionButton

src/server/session.ts       UBAH  evaluateAccess + guard berbasis DB
src/server/domain/orders.ts UBAH  signature listOrdersForAdmin
src/server/domain/admin-catalog.ts UBAH  signature listProductsForAdmin
src/lib/order-status.ts     UBAH  tambah ORDER_STATUS_LABELS
src/lib/constants.ts        UBAH  tambah LOW_STOCK_THRESHOLD
prisma/schema.prisma        UBAH  User.suspendedAt
```

`app/globals.css` **tidak berubah**. Arah visual yang dipilih memakai token yang sudah ada (`cream`, `lime`, `olive`, `sage`, `card`), dan warna toast danger memakai `red-*` bawaan Tailwind seperti yang sudah dilakukan `status-chip.tsx`.

## 5. Admin shell

`admin-shell.tsx` harus berupa client component karena hanya `usePathname()` yang dapat memberi active state. `children` tetap RSC dan diteruskan sebagai prop, jadi tidak ada halaman yang ikut menjadi client.

- **Sidebar.** Olive gelap (`--color-olive`) pada `md` ke atas. Di bawah itu sidebar melipat menjadi bar horizontal yang dapat di-scroll — tanpa drawer dan tanpa state JavaScript.
- **Navigasi.** Dashboard `/admin` · Pesanan `/admin/pesanan` · Produk & Stok `/admin/produk` · Pengguna `/admin/pengguna` · pemisah · ← Toko `/`.
- **Topbar.** Breadcrumb dengan label yang dipetakan dari segmen path, nama dan email admin yang sedang login, tombol keluar.
- **Palet.** Mengikuti token yang sudah ada di `app/globals.css`: body cream, teks olive, aksen lime, surface kartu `--color-card`. Tidak ada token warna gelap baru.

### `ActionButton`

Saat ini tiap aksi admin punya komponen client sendiri (`toggle-active-button.tsx`, `transition-buttons.tsx`) dengan bentuk identik: `useTransition` + `disabled={pending}` + hasil diabaikan. Suspend, promote/demote, dan activate adalah instance ke-3 sampai ke-5 dari bentuk yang sama, jadi satu komponen generik lebih sedikit kodenya daripada lima salinan:

```ts
type Props = {
  action: () => Promise<Result>;
  label: string;
  pendingLabel?: string;
  confirm?: string;      // teks konfirmasi untuk aksi destruktif
  variant?: "plain" | "danger";
};
```

Toast merah muncul saat hasil `{ error }` dan hilang sendiri setelah 5 detik. Sukses tidak memerlukan toast karena `revalidatePath` sudah menyegarkan halaman.

### Pencarian

`search-form.tsx` adalah GET form server component biasa, tanpa JavaScript. Ini sengaja: `header.tsx:22` sudah memakai pola `<form action="/cari"><input name="q" /></form>`, dan debounce + `router.replace` hanya akan menambah client component tanpa manfaat nyata untuk admin internal.

### `src/lib/pagination.ts`

```ts
export const PAGE_SIZE = 25;
export function parsePage(raw: string | undefined): number;          // clamp >= 1
export function parseQuery(raw: string | undefined): string;         // trim, buang wildcard % dan _, batasi 80 char
export function pageSlice(total: number, page: number): { totalPages: number; hasPrev: boolean; hasNext: boolean };
```

Dipakai oleh produk, pesanan, dan pengguna. `parseQuery` membuang `%` dan `_` karena nilai ini masuk ke `contains` Prisma dan kedua karakter itu adalah wildcard LIKE di Postgres.

### Kontrak query list

Ketiga list memakai bentuk kembali yang sama supaya `pageSlice` bisa dipakai bertiganya. `ListResult<T>` didefinisikan di `src/lib/pagination.ts` bersama helper pagination lainnya:

```ts
export type ListResult<T> = { rows: T[]; total: number };

// src/server/domain/admin-catalog.ts — UBAH dari kembalian array polos
listProductsForAdmin(actor: Session | null, query?: { q?: string; page?: number }): Promise<ListResult<AdminProductRow> | { error: string }>

// src/server/domain/orders.ts — UBAH dari (status?: OrderStatus) => OrderSummary[]
listOrdersForAdmin(query?: { status?: OrderStatus; q?: string; page?: number; take?: number }): Promise<ListResult<OrderSummary>>

// src/server/domain/admin-users.ts — BARU
listUsersForAdmin(actor: Session | null, query?: { q?: string; role?: Role; status?: "active" | "suspended"; page?: number }): Promise<ListResult<AdminUserRow> | { error: string }>
```

`Role` di sini adalah enum Prisma (`CUSTOMER | ADMIN`), sama nilainya dengan `Role` di `session.ts`.

`take` pada `listOrdersForAdmin` bersifat opsional dan saling eksklusif dengan `page`: bila diisi, fungsi melewati pagination dan mengembalikan maksimum `take` baris terbaru. Ini yang dipakai panel "Pesanan terbaru" di dashboard.

Kedua perubahan signature di atas adalah breaking change internal. Call site yang wajib diperbarui: `app/admin/produk/page.tsx:9` dan `app/admin/pesanan/page.tsx:14`.

### Yang dicocokkan tiap pencarian

| Halaman | `?q=` mencocokkan |
|---|---|
| `/admin/produk` | `Product.name`, `Product.slug` |
| `/admin/pesanan` | `Order.code`, `Order.shipRecipient`, `User.name` |
| `/admin/pengguna` | `User.name`, `User.email` |

Semuanya `mode: "insensitive"` dan digabung dengan `OR`.

## 6. Dashboard

### Definisi revenue

`confirmPayment` di `mock-gateway.ts:41` menyetel `payment.status = SUCCESS` dan `order.status = PAID` dalam satu transaksi, jadi keduanya setara pada saat pembayaran. Namun pesanan `PAID` masih dapat berpindah ke `CANCELLED` (stok dikembalikan, dan tidak ada fitur refund), sehingga `payment.status = SUCCESS` akan menghitung pesanan yang uangnya seharusnya kembali. Karena itu revenue dihitung dari **status pesanan**, bukan status pembayaran:

> Revenue = `sum(order.total)` untuk pesanan dengan `status NOT IN ('PENDING','CANCELLED')`

Definisi yang sama dipakai konsisten di KPI, chart revenue harian, dan top produk.

### KPI

Periode dipilih lewat `?periode=7|30|90`, default 30 hari. Tiap kartu membandingkan dengan periode sebelumnya sepanjang jendela yang sama.

| Kartu | Isi | Delta |
|---|---|---|
| Revenue | `sum(total)` periode ini | vs periode sebelumnya |
| Pesanan dibayar | jumlah pesanan `notIn(PENDING,CANCELLED)` | vs periode sebelumnya |
| AOV | revenue ÷ pesanan dibayar | tidak ada |
| User baru | `User.createdAt` di jendela | vs periode sebelumnya |

AOV menampilkan `—` saat pembaginya nol.

### Panel

- **Revenue harian** — `revenue-chart.tsx`, recharts `AreaChart`, sumbu X tanggal.
- **Status pesanan** — `status-donut.tsx`, recharts `PieChart` dengan lubang tengah, seluruh waktu, warna per status selaras `StatusChip`.
- **Top 5 produk** — bar horizontal **dari div + lebar persentase, bukan recharts**, urut qty terjual. Untuk lima bar statis tidak ada gunanya menambah client component ketiga; recharts dibatasi pada dua panel yang memang membutuhkannya (area dan donut).
- **Stok menipis** — varian dengan `stock <= LOW_STOCK_THRESHOLD` (konstanta baru di `src/lib/constants.ts`, nilai `5`), hanya produk aktif, urut dari yang paling tipis, maksimum 8 baris.
- **Pesanan terbaru** — 6 baris, memakai ulang `listOrdersForAdmin()`.

Seluruh panel chart dan daftar punya empty state ("Belum ada data"), bukan sumbu kosong atau tabel kosong.

### Kontrak `admin-analytics.ts`

```ts
export type Period = 7 | 30 | 90;

export type Metric = { value: number; previous: number };

export type DashboardMetrics = {
  period: Period;
  revenue: Metric;         // rupiah
  paidOrders: Metric;      // jumlah
  newUsers: Metric;        // jumlah
  aov: number;             // revenue.value ÷ paidOrders.value, 0 bila pembagi nol
  dailyRevenue: { date: string; total: number }[];              // panjang = period, terisi nol
  statusCounts: { status: OrderStatus; count: number }[];       // seluruh waktu
  topProducts: { productName: string; qty: number }[];          // maks 5
  lowStock: { productName: string; variantLabel: string; stock: number }[];  // maks 8
  recentOrders: OrderSummary[];                                 // maks 6
};

export function getDashboardMetrics(actor: Session | null, period?: Period): Promise<DashboardMetrics | { error: string }>;
export function parsePeriod(raw: string | undefined): Period;   // di luar {7,30,90} → 30
export function bucketDaily(orders: BucketInput[], from: Date, to: Date): { date: string; total: number }[];
```

`aov` dihitung di domain, bukan di komponen, supaya kartu KPI tetap server component dan rumusnya ikut teruji. Kartu menampilkan `—` ketika `paidOrders.value` nol.

### Strategi query

Revenue harian diambil dengan **satu** `prisma.order.findMany` bersudut sempit (`select: { createdAt, total, status }`) yang mencakup kedua jendela sekaligus, lalu di-bucket per hari di JavaScript. Alasan: repo ini belum memiliki `$queryRaw` sama sekali dan sudah terbiasa mereduksi di JS (`totalStock` di `admin-catalog.ts:160`, `itemCount` di `orders.ts:181`), jadi pendekatan ini tidak memperkenalkan pola baru, hasilnya type-safe, dan mudah dites tanpa SQL.

**Batas yang diketahui dan titik penggantinya:** bucketing di JS mulai terasa berat di atas sekitar 10 ribu pesanan dalam satu jendela. Pengganti yang benar adalah agregasi `date_trunc('day', "createdAt")` via `prisma.$queryRaw`. Seluruh logika bucketing dikumpulkan di satu fungsi murni `bucketDaily(orders, from, to)` yang diekspor dari `admin-analytics.ts`, supaya penggantian itu bersifat lokal dan tidak menyentuh pemanggil.

Sisanya memakai agregasi DB:

- `prisma.order.groupBy({ by: ['status'], _count: true })` untuk donut.
- `prisma.orderItem.groupBy({ by: ['productName'], _sum: { qty: true }, where: { order: { status: { notIn: ['PENDING','CANCELLED'] } } } })` untuk top produk — filter relasi ini mencegah pesanan batal menggelembungkan angka.
- `prisma.productVariant.findMany({ where: { stock: { lte: LOW_STOCK_THRESHOLD }, product: { isActive: true } }, orderBy: { stock: 'asc' }, take: 8 })` untuk stok menipis.

Seluruh pohon `/admin` sudah otomatis dinamis karena `requireAdmin()` membaca `cookies()`. Tidak perlu `force-dynamic`, dan tidak boleh ada caching yang ditambahkan di sini.

### Palet chart

recharts meneruskan warna ke atribut SVG, dan `var(--color-lime)` di atribut presentasi tidak andal di semua browser. Karena itu `chart-palette.ts` menyimpan konstanta hex yang diselaraskan manual dengan `app/globals.css` dan dengan `TONES` di `status-chip.tsx`.

`ORDER_STATUS_LABELS` dipindah dari `status-chip.tsx` (saat ini `LABELS` privat) ke `src/lib/order-status.ts` yang memang sudah memiliki pengetahuan domain `OrderStatus`, supaya legend donut dan `StatusChip` memakai label yang sama. `status-chip.tsx` mengimpornya dari sana.

## 7. User Management

### Skema

```prisma
model User {
  suspendedAt  DateTime?   // null = aktif
}
```

`suspendedAt` dipilih daripada `isActive: Boolean` karena sekaligus mencatat kapan penangguhan terjadi, dan kolom nullable tidak memerlukan backfill untuk baris yang sudah ada.

### Tipe di `admin-users.ts`

```ts
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  suspendedAt: Date | null;
  createdAt: Date;
  orderCount: number;    // dihitung hanya untuk id pada halaman aktif
  totalSpent: number;    // dihitung hanya untuk id pada halaman aktif
};

export type AdminUserDetail = AdminUserRow & {
  addresses: AddressInput[];          // tipe yang sudah ada di orders.ts
  orders: OrderSummary[];             // dari listOrdersForUser()
};
```

`orderCount` dan `totalSpent` tidak diisi oleh query list utama; keduanya diisi oleh satu `order.groupBy` terpisah yang dibatasi ke id pada halaman itu, lalu digabung di JS.

### Halaman list `/admin/pengguna`

Kolom: Nama, Email, Role, Status, Pesanan, Total belanja, Daftar.

- `?q=` mencari nama atau email dengan `mode: "insensitive"`.
- `?role=ADMIN|CUSTOMER`, `?status=active|suspended`, `?page=` dengan `PAGE_SIZE` baris per halaman.
- Jumlah pesanan dan total belanja diambil dengan satu `prisma.order.groupBy({ by: ['userId'], _count, _sum: { total } })` yang di-`where` hanya ke id pengguna pada halaman tersebut — bukan agregasi seluruh tabel. Agregasi ini mengecualikan `PENDING` dan `CANCELLED` agar konsisten dengan definisi revenue di §6.

### Halaman detail `/admin/pengguna/[id]`

Identitas dengan badge role dan status, ringkasan belanja, daftar alamat tersimpan, dan riwayat pesanan memakai ulang `listOrdersForUser()` yang sudah ada. Ketiga aksi tersedia di sini dan di baris tabel list. User yang tidak ditemukan → `notFound()`.

### Aksi

Semuanya lewat `ActionButton` dan mengikuti pola `assertRole` → `{ error: "FORBIDDEN" }`.

| Aksi | Server action | Fungsi domain |
|---|---|---|
| Promote / demote | `setUserRoleAction` | `setUserRole(targetId, role, actor)` |
| Suspend / aktifkan | `setUserSuspendedAction` | `setUserSuspended(targetId, suspended, actor)` |
| Reset password | `resetUserPasswordAction` | `resetUserPassword(targetId, password, actor)` |

`revalidatePath` dibuat presisi: hanya `/admin/pengguna` dan `/admin/pengguna/[id]`, tidak seluruh pohon admin.

### Aturan pengaman

1. **Tidak bisa mengubah akun sendiri.** `targetId === actor.userId` → `{ error: "Tidak bisa mengubah akun sendiri." }`. Alasannya spesifik: karena role sekarang dibaca dari DB, demote diri sendiri mencabut akses admin pada detik itu juga dan mengunci pelakunya di luar sistem. Berlaku untuk suspend maupun perubahan role.
2. **Admin terakhir tidak boleh dilucuti.** Sebelum demote atau suspend seorang ADMIN, hitung admin aktif lain (`role = ADMIN AND suspendedAt IS NULL AND id != targetId`); kalau nol, tolak. Satu helper dipakai kedua aksi.
3. **Reset password memakai password yang diketik admin**, bukan yang digenerate lalu ditampilkan. Repo ini tidak punya infrastruktur email, dan menampilkan password plaintext di UI lebih buruk daripada admin yang memang sudah mengetiknya. Minimum 8 karakter, sama dengan `registerAction`.
4. **Suspend menandakan pencabutan akses**, bukan penghapusan data. Keranjang dan riwayat pesanan pengguna tetap utuh.

### Efek ke flow login

`loginAction` mendapat satu pemeriksaan setelah verifikasi password berhasil: kalau `suspendedAt` terisi, kembalikan `"Akun ditangguhkan."`. Pesan ini hanya muncul setelah password benar, jadi tidak membocorkan keberadaan akun kepada yang tidak berhak.

## 8. Session enforcement

Sesi memakai JWT stateless dengan masa berlaku 7 hari (`session.ts:13`), sehingga penangguhan dan perubahan role tidak berpengaruh pada token yang sudah terbit. Sesuai keputusan, penegakan dilakukan di guard route terproteksi.

Keputusan ini juga memperbaiki bug laten: saat ini role dibaca dari payload JWT, sehingga promote seorang customer menjadi ADMIN tidak berlaku sampai dia login ulang. Dengan guard berbasis DB, perubahan role langsung efektif.

Karena `requireUser`/`requireAdmin` sekarang harus membaca DB dan membedakan tiga hasil berbeda, logika keputusannya dipecah menjadi fungsi murni — mengikuti pola `assertRole` yang sudah ada — supaya dapat dites tanpa mock `cookies()` dan `redirect()`:

```ts
export function evaluateAccess(
  user: { role: Role; suspendedAt: Date | null } | null,
  required: Role,
): { ok: true } | { reason: "NO_SESSION" | "SUSPENDED" | "FORBIDDEN" }
```

`requireUser`/`requireAdmin` menjadi pembungkus IO tipis: baca cookie → verifikasi JWT → muat user dari DB → `evaluateAccess` → redirect atau return. Target redirect mempertahankan perilaku yang sudah ada: `requireUser` → `/login`, `requireAdmin` → `/login?next=/admin` untuk `NO_SESSION`/`SUSPENDED` dan `/` untuk `FORBIDDEN`.

`assertRole` yang sudah ada **tidak diubah** dan tetap dipakai oleh modul domain. `evaluateAccess` adalah tambahan untuk guard route, bukan pengganti — keduanya menjawab pertanyaan berbeda: `assertRole` untuk otorisasi sebuah operasi, `evaluateAccess` untuk memutuskan apakah sebuah sesi masih boleh masuk.

`getCurrentSession()` **tidak diubah**. Konsekuensinya diterima sebagai kosmetik: header storefront masih menampilkan pengguna yang di-suspend sebagai login sampai dia membuka rute terproteksi dan dipantulkan ke `/login`. Perbaikan murah tersedia bila nanti diinginkan — `header.tsx:11` sudah melakukan query DB untuk `cartCount` setiap kali ada sesi — tetapi sengaja tidak diambil sekarang.

Cookie tidak dapat dihapus saat render di Next 15 (mutasi cookie hanya diizinkan di Server Action atau Route Handler), jadi "logout otomatis saat di-suspend" tidak mungkin dilakukan dari guard.

## 9. Error handling

Tidak ada pola baru. Fungsi domain mengembalikan `{ error: string }` untuk kegagalan yang diharapkan dan tidak melempar exception. Server action memanggil `getCurrentSession()`, meneruskannya ke domain, lalu `revalidatePath` dan `{ ok: true }`.

Guard sengaja ganda: layout sudah memanggil `requireAdmin()`, tetapi domain tetap memanggil `assertRole`. Server action adalah endpoint POST yang dapat dicapai langsung tanpa melewati layout, jadi guard di domain adalah lapis kedua, bukan redundansi — dan ini persis pola yang sudah dites di `admin-catalog.test.ts:31`.

Setiap tabel dan daftar memiliki empty state, termasuk "tidak ada hasil untuk pencarian ini".

### Limitasi yang diketahui dan disengaja

- **Reset password tidak mencabut sesi yang sedang hidup.** JWT stateless dan tidak ada kolom versi token. Ini koheren dengan pembagian tanggung jawab di atas: *suspend* adalah mekanisme cabut akses, *reset password* adalah mekanisme ganti kredensial. Menambahkan `sessionVersion` untuk menutup celah ini dinilai scope creep untuk sebuah demo.
- **Reset password ditentukan admin, bukan lewat tautan email.** Di produksi ini harus diganti dengan tautan reset sekali-pakai yang dikirim lewat email.

## 10. Testing

Mengikuti `tests/integration/*` yang ada: `cleanDb`, `makeUser`, dan Postgres test DB sungguhan — bukan mock.

**Unit**

- `tests/unit/evaluate-access.test.ts` — `{ ok: true }` untuk role cocok dan tidak suspended; `NO_SESSION`; `SUSPENDED`; `FORBIDDEN` untuk role tidak cocok.
- `tests/unit/pagination.test.ts` — clamping `parsePage`, sanitasi `parseQuery`, batas `pageSlice` (total 0, tepat satu halaman, sisa satu baris).
- `tests/unit/bucket-daily.test.ts` — satu entri per hari dalam rentang, hari tanpa pesanan diisi nol, pesanan di luar rentang diabaikan.

**Integrasi**

- `tests/integration/admin-users.test.ts` — aktor non-admin ditolak di ketiga aksi; promote/demote persist; demote diri sendiri ditolak; demote admin terakhir ditolak; suspend menyetel `suspendedAt` dan activate mengosongkannya; suspend diri sendiri ditolak; suspend admin terakhir ditolak; reset password membuat password baru lolos `verifyPassword` dan password lama gagal; password di bawah 8 karakter ditolak; search, filter role, filter status, dan pagination pada list; agregasi total belanja mengecualikan `CANCELLED`.
- `tests/integration/admin-analytics.test.ts` — revenue mengecualikan `PENDING` dan `CANCELLED`; delta antar periode; distribusi status; top produk mengecualikan pesanan batal; ambang stok menipis dan hanya produk aktif; DB kosong menghasilkan nol di semua metrik tanpa crash.

**Verifikasi manual di browser** setelah implementasi: dashboard dengan data seed nyata, suspend seorang customer lalu coba login sebagai dia, perilaku header storefront, dan sidebar pada lebar mobile.

## 11. Dependensi & migrasi

- `npm i recharts` — versi 3.10.1, `peerDependencies` mencakup `react ^19.0.0` (sudah diverifikasi terhadap registry).
- `prisma migrate dev` untuk `User.suspendedAt`.
- `prisma/seed.ts` tidak berubah; kolom baru nullable sehingga default `null` sudah benar untuk semua akun seed.

## 12. Deviasi implementasi

Tiga penyimpangan dari spec ini tercatat selama implementasi:

1. **§8 — `evaluateAccess` parameter opsional.** Spec menulis `evaluateAccess(user, required: Role)`. Implementasi memakai `required?: Role` karena `requireUser()` menerima role apa pun dan tidak punya nilai `Role` untuk diteruskan. Tanpa opsional, signature di spec tidak bisa dipakai oleh `requireUser`.

2. **§5 — `SearchForm` sebagai client component.** Spec menulis `search-form.tsx` sebagai GET form server component biasa. Ini tidak bisa dipakai karena `/admin/pesanan?status=PAID` punya query param lain yang harus dipertahankan, dan GET form HTML membuang semua param yang tidak punya input di dalam form. Solusi: client component kecil dengan `router.replace` yang mempertahankan param lain via `useSearchParams`.

3. **§4 — `toggle-active-button.tsx` dihapus.** Spec menulis "dibangun ulang di atas ActionButton". Implementasi menghapusnya sepenuhnya karena `ActionButton` menggantikannya tanpa perlu wrapper — `app/admin/produk/page.tsx` memakai `ActionButton` langsung.

4. **§9 — Guard order di `setUserRole`/`setUserSuspended`.** Implementasi memeriksa guard "admin terakhir" sebelum "bukan akun sendiri", berbeda dari urutan di plan. Ini karena bila actor == target DAN target adalah admin terakhir, pesan "Tidak bisa mengubah akun sendiri." lebih tepat ditampilkan daripada "Admin terakhir tidak bisa dilucuti."
