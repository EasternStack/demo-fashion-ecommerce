# Admin Console v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun ulang area `/admin` menjadi admin console yang layak — dashboard metrik, manajemen pengguna, dan shell baru — di atas arsitektur RSC + domain module yang sudah ada.

**Architecture:** Halaman tetap React Server Component yang membaca lewat modul domain di `src/server/domain/*`. Semua mutasi lewat Server Actions tipis yang memanggil domain lalu `revalidatePath`. Client component hanya untuk dua hal yang wajib: chart recharts dan tombol aksi. Tidak ada pola arsitektur kedua.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Prisma 6 + PostgreSQL, Tailwind CSS v4 (`@theme` tokens), Vitest 3, recharts ^3.10.1 (satu-satunya dependensi baru).

**Spec:** `docs/superpowers/specs/2026-09-28-admin-console-design.md` — plan ini berargumen dari spec tersebut; eksekutor wajib membaca keduanya.

## Global Constraints

Setiap task di bawah secara implisit mencakup bagian ini.

- **Bahasa UI:** seluruh teks yang terlihat pengguna dalam Bahasa Indonesia, mengikuti kode yang sudah ada.
- **Design tokens:** hanya memakai token yang sudah ada di `app/globals.css` — `cream`, `lime`, `olive`, `sage`, `card`. **`app/globals.css` tidak boleh diubah.** Warna merah untuk danger memakai `red-*` bawaan Tailwind seperti yang sudah dilakukan `status-chip.tsx`.
- **Pola domain:** setiap fungsi domain admin menerima `actor: Session | null` sebagai parameter terakhir dan dimulai dengan `try { assertRole(actor, "ADMIN"); } catch { return { error: "FORBIDDEN" }; }`. Kegagalan yang diharapkan dikembalikan sebagai `{ error: string }`, **tidak pernah** dilempar sebagai exception.
- **Definisi revenue:** `sum(order.total)` untuk pesanan dengan `status NOT IN ('PENDING','CANCELLED')`. Dipakai konsisten di semua metrik, chart, dan agregasi belanja pengguna.
- **Konstanta:** `PAGE_SIZE = 25`, `LOW_STOCK_THRESHOLD = 5`.
- **Testing:** Vitest berjalan dengan `environment: "node"`, `fileParallelism: false`, dan `globalSetup` menjalankan `prisma migrate deploy` ke `TEST_DATABASE_URL`. Test integrasi memakai Postgres test DB sungguhan lewat `cleanDb()` dan `makeUser()`/`makeCategory()`/`makeProduct()`. **Jangan mock database.**
- **Tidak ada unit test untuk UI.** Repo ini tidak punya jsdom maupun testing-library, jadi komponen `.tsx` diverifikasi lewat `npx tsc --noEmit`, `npm run build`, dan pemeriksaan manual di browser. Jangan menambahkan dependensi testing UI.
- **Batas serialisasi RSC → Client Component:** prop harus serializable. Untuk meneruskan Server Action dari Server Component ke Client Component, gunakan `.bind(null, ...args)` pada action yang diimpor — **jangan** arrow function, karena akan melempar "Functions cannot be passed directly to Client Components". Di dalam Client Component yang memanggil Client Component lain, arrow function biasa tetap aman.
- **Prisma `contains` dan wildcard:** `%` dan `_` adalah wildcard LIKE di Postgres dan Prisma tidak meng-escape-nya. Karena itu **setiap fungsi domain** yang membangun `contains` wajib memanggil `parseQuery()` (Task 1) pada kata kunci sebelum memasukkannya ke `where`. Halaman juga memanggil `parseQuery()` untuk keperluan tampilan (empty state, `TablePager`); pemanggilan ganda ini idempoten dan disengaja — domain tidak boleh bergantung pada caller yang sudah menyaring.
- **Commit setelah setiap task.** Jangan menumpuk beberapa task dalam satu commit.
- **Prasyarat sekali di awal sesi:** `npm run db:up` (Postgres app di 5432, test di 5433) dan pastikan `.env` berisi `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`.
- **Kredensial seed untuk verifikasi manual:** `admin@demo.id` / `admin1234` dan `customer@demo.id` / `customer1234`.

---

### Task 1: Pagination & constants foundation

Fondasi yang dipakai Task 4, 5, 7, dan 10. Tidak menyentuh UI.

**Files:**
- Create: `src/lib/pagination.ts`
- Modify: `src/lib/constants.ts`
- Test: `tests/unit/pagination.test.ts`

**Interfaces:**
- Consumes: tidak ada (task pertama).
- Produces:
  - `PAGE_SIZE: number` (= `25`)
  - `type ListResult<T> = { rows: T[]; total: number }`
  - `parsePage(raw: string | undefined): number`
  - `parseQuery(raw: string | undefined): string`
  - `pageSlice(total: number, page: number): { totalPages: number; hasPrev: boolean; hasNext: boolean }`
  - `LOW_STOCK_THRESHOLD: number` (= `5`)

- [ ] **Step 1: Tulis test yang gagal**

Buat `tests/unit/pagination.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageSlice, parsePage, parseQuery } from "@/lib/pagination";

describe("parsePage", () => {
  it("mengembalikan 1 untuk input kosong atau tidak valid", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
  });

  it("mempertahankan halaman valid dan membuang desimal", () => {
    expect(parsePage("4")).toBe(4);
    expect(parsePage("2.9")).toBe(2);
  });
});

describe("parseQuery", () => {
  it("memangkas spasi dan membuang wildcard LIKE", () => {
    expect(parseQuery("  jaket  ")).toBe("jaket");
    expect(parseQuery("%admin_")).toBe("admin");
    expect(parseQuery(undefined)).toBe("");
  });

  it("membatasi panjang ke 80 karakter", () => {
    expect(parseQuery("a".repeat(120))).toHaveLength(80);
  });
});

describe("pageSlice", () => {
  it("total 0 tetap satu halaman tanpa navigasi", () => {
    expect(pageSlice(0, 1)).toEqual({ totalPages: 1, hasPrev: false, hasNext: false });
  });

  it("tepat satu halaman penuh tidak membuka halaman berikutnya", () => {
    expect(pageSlice(PAGE_SIZE, 1)).toEqual({ totalPages: 1, hasPrev: false, hasNext: false });
  });

  it("sisa satu baris membuka halaman berikutnya", () => {
    expect(pageSlice(PAGE_SIZE + 1, 1)).toEqual({ totalPages: 2, hasPrev: false, hasNext: true });
    expect(pageSlice(PAGE_SIZE + 1, 2)).toEqual({ totalPages: 2, hasPrev: true, hasNext: false });
  });
});
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npx vitest run tests/unit/pagination.test.ts`
Expected: FAIL — tidak bisa resolve `@/lib/pagination`.

- [ ] **Step 3: Tulis implementasi**

Buat `src/lib/pagination.ts`:

```ts
export const PAGE_SIZE = 25;

export type ListResult<T> = { rows: T[]; total: number };

export function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

export function parseQuery(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/[%_]/g, "").slice(0, 80);
}

export function pageSlice(
  total: number,
  page: number,
): { totalPages: number; hasPrev: boolean; hasNext: boolean } {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { totalPages, hasPrev: page > 1, hasNext: page < totalPages };
}
```

Ganti seluruh isi `src/lib/constants.ts` menjadi:

```ts
export const SHIPPING_FLAT_COST = 15000;
export const LOW_STOCK_THRESHOLD = 5;
```

- [ ] **Step 4: Jalankan test dan pastikan lulus**

Run: `npx vitest run tests/unit/pagination.test.ts`
Expected: PASS, 7 test hijau.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagination.ts src/lib/constants.ts tests/unit/pagination.test.ts
git commit -m "feat: add pagination helpers and low stock threshold"
```

---

### Task 2: Session enforcement berbasis DB + migrasi `User.suspendedAt`

Menegakkan suspend dan perubahan role terhadap JWT yang masih hidup. Sekalian memperbaiki bug laten: role saat ini dibaca dari payload JWT sehingga promote tidak berlaku sampai user login ulang.

**Files:**
- Modify: `prisma/schema.prisma` (model `User`, baris 30-40)
- Create: `prisma/migrations/<timestamp>_add_user_suspended_at/migration.sql` (digenerate Prisma)
- Modify: `src/server/session.ts`
- Modify: `src/server/actions/auth.ts` (`loginAction`, baris 25-35)
- Test: `tests/unit/evaluate-access.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `getCurrentSession`, `Session`, `Role` yang sudah ada di `src/server/session.ts`.
- Produces:
  - `evaluateAccess(user: { role: Role; suspendedAt: Date | null } | null, required?: Role): { ok: true } | { reason: "NO_SESSION" | "SUSPENDED" | "FORBIDDEN" }`
  - `type AdminSession = Session & { name: string; email: string }`
  - `requireUser(): Promise<Session>` — signature tidak berubah, kini menolak akun suspended
  - `requireAdmin(): Promise<AdminSession>` — **return type bertambah field** `name` dan `email`; caller lama tetap kompatibel
  - Kolom DB baru `User.suspendedAt DateTime?`

**Penyempurnaan terhadap spec:** §8 spec menulis `evaluateAccess(user, required: Role)`. Plan ini menyempurnakannya menjadi `required?: Role` karena `requireUser()` menerima role apa pun dan tidak punya nilai `Role` untuk diteruskan. Tanpa penyempurnaan ini signature di spec tidak bisa dipakai oleh `requireUser`.

- [ ] **Step 1: Tambahkan kolom ke skema**

Di `prisma/schema.prisma`, dalam `model User`, tambahkan satu baris setelah `createdAt`:

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  name         String
  role         Role      @default(CUSTOMER)
  createdAt    DateTime  @default(now())
  suspendedAt  DateTime?
  addresses    Address[]
  cart         Cart?
  orders       Order[]
}
```

- [ ] **Step 2: Jalankan migrasi**

Run: `npm run db:up && npx prisma migrate dev --name add_user_suspended_at`
Expected: migrasi baru terbuat di `prisma/migrations/`, Prisma Client di-regenerate, tanpa error. Kolom nullable sehingga tidak perlu backfill.

- [ ] **Step 3: Tulis test yang gagal untuk `evaluateAccess`**

Buat `tests/unit/evaluate-access.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { evaluateAccess } from "@/server/session";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: () => {},
    get: () => undefined,
    delete: () => {},
  }),
}));

const ACTIVE_ADMIN = { role: "ADMIN" as const, suspendedAt: null };
const ACTIVE_CUSTOMER = { role: "CUSTOMER" as const, suspendedAt: null };
const SUSPENDED = { role: "CUSTOMER" as const, suspendedAt: new Date("2026-09-01T00:00:00Z") };

describe("evaluateAccess", () => {
  it("mengizinkan user apa pun bila tidak ada role yang dipersyaratkan", () => {
    expect(evaluateAccess(ACTIVE_ADMIN)).toEqual({ ok: true });
    expect(evaluateAccess(ACTIVE_CUSTOMER)).toEqual({ ok: true });
  });

  it("mengizinkan role yang cocok dan tidak suspended", () => {
    expect(evaluateAccess(ACTIVE_ADMIN, "ADMIN")).toEqual({ ok: true });
    expect(evaluateAccess(ACTIVE_CUSTOMER, "CUSTOMER")).toEqual({ ok: true });
  });

  it("menolak tanpa user sebagai NO_SESSION", () => {
    expect(evaluateAccess(null)).toEqual({ reason: "NO_SESSION" });
    expect(evaluateAccess(null, "ADMIN")).toEqual({ reason: "NO_SESSION" });
  });

  it("menolak akun suspended sebelum memeriksa role", () => {
    expect(evaluateAccess(SUSPENDED)).toEqual({ reason: "SUSPENDED" });
    expect(evaluateAccess({ role: "ADMIN", suspendedAt: new Date() }, "ADMIN")).toEqual({
      reason: "SUSPENDED",
    });
  });

  it("menolak role tidak cocok sebagai FORBIDDEN", () => {
    expect(evaluateAccess(ACTIVE_CUSTOMER, "ADMIN")).toEqual({ reason: "FORBIDDEN" });
  });
});
```

Mock `next/headers` diperlukan karena `session.ts` mengimpornya di tingkat modul; pola ini sama dengan yang sudah dipakai `tests/unit/session.test.ts:7`.

- [ ] **Step 4: Jalankan test dan pastikan gagal**

Run: `npx vitest run tests/unit/evaluate-access.test.ts`
Expected: FAIL — `evaluateAccess` belum diekspor dari `@/server/session`.

- [ ] **Step 5: Implementasi `evaluateAccess` dan guard berbasis DB**

Di `src/server/session.ts`, tambahkan import prisma di bawah import `jose`:

```ts
import { prisma } from "@/server/db";
```

Tambahkan tepat setelah deklarasi `export type Session`:

```ts
export type AdminSession = Session & { name: string; email: string };

export type AccessDenied = { reason: "NO_SESSION" | "SUSPENDED" | "FORBIDDEN" };

export function evaluateAccess(
  user: { role: Role; suspendedAt: Date | null } | null,
  required?: Role,
): { ok: true } | AccessDenied {
  if (!user) return { reason: "NO_SESSION" };
  if (user.suspendedAt) return { reason: "SUSPENDED" };
  if (required && user.role !== required) return { reason: "FORBIDDEN" };
  return { ok: true };
}

type LoadedUser = { role: Role; suspendedAt: Date | null; name: string; email: string };

async function loadSessionUser(): Promise<{ session: Session; user: LoadedUser } | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, suspendedAt: true, name: true, email: true },
  });
  if (!user) return null;
  return { session: { userId: session.userId, role: user.role }, user };
}
```

Ganti seluruh isi `requireUser` dan `requireAdmin` (baris 70-81 saat ini) menjadi:

```ts
export async function requireUser(): Promise<Session> {
  const loaded = await loadSessionUser();
  const access = evaluateAccess(loaded?.user ?? null);
  if ("ok" in access) return loaded!.session;
  redirect("/login");
}

export async function requireAdmin(): Promise<AdminSession> {
  const loaded = await loadSessionUser();
  const access = evaluateAccess(loaded?.user ?? null, "ADMIN");
  if ("ok" in access) {
    return { ...loaded!.session, name: loaded!.user.name, email: loaded!.user.email };
  }
  redirect(access.reason === "FORBIDDEN" ? "/" : "/login?next=/admin");
}
```

Catatan penting: `role` pada `Session` yang dikembalikan kini berasal dari **DB**, bukan dari payload JWT — inilah perbaikan bug laten promote-yang-tidak-berlaku. `assertRole`, `getCurrentSession`, `loginSession`, `logoutSession`, `hashPassword`, `verifyPassword` **tidak diubah**.

- [ ] **Step 6: Jalankan test dan pastikan lulus**

Run: `npx vitest run tests/unit/evaluate-access.test.ts tests/unit/session.test.ts tests/unit/assert-role.test.ts`
Expected: PASS semua. `session.test.ts` yang sudah ada harus tetap hijau karena `getCurrentSession` tidak disentuh.

- [ ] **Step 7: Tolak akun suspended saat login**

Di `src/server/actions/auth.ts`, dalam `loginAction`, sisipkan tiga baris setelah blok verifikasi password dan sebelum `loginSession`. Hasil akhirnya persis:

```ts
export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Email atau password salah." };
  }
  if (user.suspendedAt) {
    return { error: "Akun ditangguhkan." };
  }
  await loginSession(user.id, user.role);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") ? next : "/");
}
```

Pesan `"Akun ditangguhkan."` hanya dikembalikan setelah password benar, jadi tidak membocorkan keberadaan akun kepada yang tidak berhak.

Perubahan ini **tidak** punya unit test: `loginAction` memanggil `redirect()` dari `next/navigation` dan repo ini tidak punya pola mock untuknya. Diverifikasi manual di Task 8 Step 5 butir 7.

- [ ] **Step 8: Typecheck keseluruhan**

Run: `npx tsc --noEmit`
Expected: bersih. Penambahan field pada `AdminSession` bersifat aditif, jadi caller `requireAdmin()` yang lama seharusnya tidak rusak.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/session.ts src/server/actions/auth.ts tests/unit/evaluate-access.test.ts
git commit -m "feat: enforce suspended accounts and live role changes in route guards"
```

---

### Task 3: `ActionButton` dan refactor tombol admin yang ada

Menggantikan pola satu-component-client-per-aksi. Setelah task ini `toggle-active-button.tsx` **dihapus** dan `transition-buttons.tsx` dibangun ulang di atas `ActionButton`.

**Deviasi dari spec:** §4 spec menulis `toggle-active-button.tsx UBAH dibangun ulang di atas ActionButton`. Plan ini menghapusnya, bukan membungkusnya — setelah `ActionButton` ada, wrapper itu tidak menambahkan apa pun selain satu lapisan file. `app/admin/produk/page.tsx` memakai `ActionButton` langsung. Ini konsisten dengan maksud §5 spec (berhenti membuat satu component client per aksi).

**Files:**
- Create: `src/components/admin/action-button.tsx`
- Delete: `src/components/admin/toggle-active-button.tsx`
- Modify: `src/components/admin/transition-buttons.tsx`
- Modify: `app/admin/produk/page.tsx` (baris 5 dan 37-42)

**Interfaces:**
- Consumes: `type Result = { ok: true } | { error: string }` dari `src/server/domain/cart.ts`; `toggleProductActiveAction(productId: string): Promise<Result>` dan `adminOrderTransitionAction(orderCode: string, to: OrderStatus): Promise<Result>` dari `src/server/actions/admin.ts`.
- Produces:
  ```ts
  // src/components/admin/action-button.tsx
  export function ActionButton(props: {
    action: () => Promise<Result>;
    label: string;
    pendingLabel?: string;
    confirm?: string;
    variant?: "plain" | "danger";
  }): JSX.Element
  ```

- [ ] **Step 1: Buat `ActionButton`**

Buat `src/components/admin/action-button.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Result } from "@/server/domain/cart";

type Props = {
  action: () => Promise<Result>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "plain" | "danger";
};

export function ActionButton({ action, label, pendingLabel, confirm, variant = "plain" }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(() => {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setError(null), 5000);
      }
    });
  }, [action, confirm]);

  const tone =
    variant === "danger"
      ? "border border-red-700 text-red-700 hover:bg-red-50"
      : "bg-lime text-olive hover:brightness-95";

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest disabled:opacity-50 ${tone}`}
      >
        {pending ? (pendingLabel ?? label) : label}
      </button>
      {error && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          {error}
        </div>
      )}
    </>
  );
}
```

`import type` untuk `Result` sengaja: type-only import dihapus saat compile, jadi client component ini tidak menyeret `prisma` ke bundle browser.

- [ ] **Step 2: Bangun ulang `TransitionButtons` di atasnya**

Ganti seluruh isi `src/components/admin/transition-buttons.tsx`:

```tsx
"use client";

import type { OrderStatus } from "@prisma/client";
import { adminOrderTransitionAction } from "@/server/actions/admin";
import { ActionButton } from "./action-button";

const LABELS: Partial<Record<OrderStatus, string>> = {
  PROCESSING: "Mulai Proses",
  SHIPPED: "Kirim Paket",
  DELIVERED: "Tandai Diterima",
  CANCELLED: "Batalkan Pesanan",
};

export function TransitionButtons({ orderCode, targets }: { orderCode: string; targets: OrderStatus[] }) {
  const actionable = targets.filter((t) => t !== "PAID");
  if (actionable.length === 0) return <p className="text-xs opacity-60">Tidak ada aksi tersedia.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {actionable.map((t) => (
        <ActionButton
          key={t}
          action={() => adminOrderTransitionAction(orderCode, t)}
          label={LABELS[t] ?? t}
          confirm={`Ubah status pesanan menjadi ${t}?`}
          variant={t === "CANCELLED" ? "danger" : "plain"}
        />
      ))}
    </div>
  );
}
```

Arrow function di sini aman: `TransitionButtons` sudah berupa Client Component, jadi tidak ada fungsi yang menyeberang batas server → client.

- [ ] **Step 3: Hapus `ToggleActiveButton` dan pakai `ActionButton` langsung**

Run: `git rm src/components/admin/toggle-active-button.tsx`

Di `app/admin/produk/page.tsx`, ganti import `ToggleActiveButton` (baris 5) dengan dua import:

```tsx
import { ActionButton } from "@/components/admin/action-button";
import { toggleProductActiveAction } from "@/server/actions/admin";
```

Ganti `<ToggleActiveButton productId={r.id} isActive={r.isActive} />` (baris 40) menjadi:

```tsx
<ActionButton
  action={toggleProductActiveAction.bind(null, r.id)}
  label={r.isActive ? "Nonaktifkan" : "Aktifkan"}
  confirm={r.isActive ? `Nonaktifkan ${r.name}?` : `Aktifkan ${r.name}?`}
/>
```

Perhatikan `.bind(null, r.id)` — halaman ini Server Component, jadi arrow function **tidak boleh** dipakai di sini.

- [ ] **Step 4: Typecheck dan build**

Run: `npx tsc --noEmit && npm run build`
Expected: keduanya bersih. Build akan menangkap bila ada prop fungsi yang menyeberang batas RSC → Client.

- [ ] **Step 5: Verifikasi manual di browser**

Run: `npm run dev`, login sebagai `admin@demo.id` / `admin1234`.

1. Buka `/admin/produk`. Klik **Nonaktifkan** pada satu produk → muncul dialog konfirmasi → setelah diterima, status baris berubah jadi "Nonaktif".
2. Buka `/admin/pesanan`, klik satu kode pesanan berstatus `PAID` atau `PROCESSING`. Klik **Batalkan Pesanan** → konfirmasi → status jadi `Dibatalkan` dan timeline bertambah satu entri.
3. Pada pesanan yang sudah `DELIVERED`, pastikan yang muncul adalah teks `Tidak ada aksi tersedia.`
4. Buka DevTools console di langkah 1 dan 2 → pastikan **tidak ada** warning `Functions cannot be passed directly to Client Components` dan tidak ada error React.

Jalur toast error belum teruji di task ini (butuh aksi yang ditolak server); diuji di Task 8 Step 5 butir 8.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/action-button.tsx src/components/admin/transition-buttons.tsx src/components/admin/toggle-active-button.tsx app/admin/produk/page.tsx
git commit -m "refactor: unify admin action buttons behind ActionButton with error toast"
```

---

### Task 4: Pencarian + pagination untuk produk

Memperkenalkan dua komponen UI bersama (`search-form.tsx`, `table-pager.tsx`) yang dipakai ulang di Task 5 dan Task 8.

**Files:**
- Modify: `src/server/domain/admin-catalog.ts` (`listProductsForAdmin`, baris 144-163)
- Modify: `app/admin/produk/page.tsx`
- Create: `src/components/admin/search-form.tsx`
- Create: `src/components/admin/table-pager.tsx`
- Test: `tests/integration/admin-catalog.test.ts` (tambah `describe` baru)

**Interfaces:**
- Consumes: `PAGE_SIZE`, `ListResult`, `parsePage`, `parseQuery`, `pageSlice` dari `src/lib/pagination.ts` (Task 1); `ActionButton` (Task 3).
- Produces:
  - `listProductsForAdmin(actor: Session | null, query?: { q?: string; page?: number }): Promise<ListResult<AdminProductRow> | { error: string }>` — **breaking change** dari kembalian array polos
  - `SearchForm(props: { placeholder: string; label?: string }): JSX.Element`
  - `TablePager(props: { total: number; page: number; searchParams: Record<string, string | undefined> }): JSX.Element`

- [ ] **Step 1: Tulis test yang gagal**

Di `tests/integration/admin-catalog.test.ts`, gabungkan `listProductsForAdmin` ke import dari `@/server/domain/admin-catalog` yang sudah ada di baris 3, lalu tambahkan `describe` baru di dalam `describe("admin-catalog", ...)`, setelah test `toggleProductActive`:

```ts
  describe("listProductsForAdmin", () => {
    it("menolak aktor non-admin", async () => {
      await expect(listProductsForAdmin(customer)).resolves.toEqual({ error: "FORBIDDEN" });
    });

    it("mengembalikan rows dan total", async () => {
      const cat = await makeCategory();
      await makeProduct(cat.id);
      await makeProduct(cat.id);
      const result = await listProductsForAdmin(admin);
      expect("error" in result).toBe(false);
      const { rows, total } = result as { rows: unknown[]; total: number };
      expect(total).toBe(2);
      expect(rows).toHaveLength(2);
    });

    it("mencari berdasarkan nama secara case-insensitive", async () => {
      const cat = await makeCategory();
      const jaket = await makeProduct(cat.id);
      await makeProduct(cat.id);
      const result = await listProductsForAdmin(admin, { q: jaket.name.toUpperCase() });
      expect((result as { total: number }).total).toBe(1);
    });

    it("mencari berdasarkan slug", async () => {
      const cat = await makeCategory();
      const jaket = await makeProduct(cat.id);
      await makeProduct(cat.id);
      const result = await listProductsForAdmin(admin, { q: jaket.slug });
      expect((result as { total: number }).total).toBe(1);
    });

    it("memperlakukan underscore secara literal, bukan wildcard satu karakter", async () => {
      const cat = await makeCategory();
      const a = await makeProduct(cat.id);
      const b = await makeProduct(cat.id);
      await prisma.product.update({ where: { id: a.id }, data: { name: "ABC" } });
      await prisma.product.update({ where: { id: b.id }, data: { name: "AXC" } });
      // Tanpa sanitasi, "A_C" adalah pola LIKE yang cocok dengan keduanya.
      const result = await listProductsForAdmin(admin, { q: "A_C" });
      expect((result as { total: number }).total).toBe(0);
    });

    it("memotong hasil per halaman", async () => {
      const cat = await makeCategory();
      for (let i = 0; i < 26; i++) await makeProduct(cat.id);
      const page1 = await listProductsForAdmin(admin, { page: 1 });
      const page2 = await listProductsForAdmin(admin, { page: 2 });
      expect((page1 as { rows: unknown[] }).rows).toHaveLength(25);
      expect((page2 as { rows: unknown[] }).rows).toHaveLength(1);
      expect((page2 as { total: number }).total).toBe(26);
    });
  });
```

Test underscore inilah yang membuktikan sanitasi terjadi **di domain**, bukan hanya di halaman: `_` adalah wildcard satu karakter di LIKE, jadi tanpa `parseQuery` pencarian `"A_C"` akan cocok dengan `ABC` maupun `AXC` dan mengembalikan `total` 2. Kasus `%` tidak diuji di sini karena setelah disanitasi ia menjadi string kosong yang berarti "tanpa pencarian" — perilakunya identik dengan tidak mengirim `q` sama sekali, dan `parseQuery`-nya sendiri sudah diuji di `tests/unit/pagination.test.ts` (Task 1).

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npx vitest run tests/integration/admin-catalog.test.ts`
Expected: FAIL — `listProductsForAdmin` mengembalikan array, bukan `{ rows, total }`, dan belum menerima parameter `query`.

- [ ] **Step 3: Ubah `listProductsForAdmin`**

Di `src/server/domain/admin-catalog.ts`, tambahkan import di bagian atas:

```ts
import { Prisma } from "@prisma/client";
import { PAGE_SIZE, parseQuery, type ListResult } from "@/lib/pagination";
```

Ganti seluruh fungsi `listProductsForAdmin` (baris 144-163) menjadi:

```ts
export async function listProductsForAdmin(
  actor: Session | null,
  query: { q?: string; page?: number } = {},
): Promise<ListResult<AdminProductRow> | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const page = Math.max(1, query.page ?? 1);
  const q = parseQuery(query.q);
  const where: Prisma.ProductWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, variants: { select: { stock: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return {
    total,
    rows: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      categoryName: p.category.name,
      basePrice: p.basePrice,
      totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      isActive: p.isActive,
    })),
  };
}
```

- [ ] **Step 4: Jalankan test dan pastikan lulus**

Run: `npx vitest run tests/integration/admin-catalog.test.ts`
Expected: PASS semua, termasuk test lama yang tidak tersentuh.

- [ ] **Step 5: Buat `SearchForm`**

Buat `src/components/admin/search-form.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SearchForm({ placeholder, label = "Cari" }: { placeholder: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q")?.toString().trim() ?? "";
    const next = new URLSearchParams(params.toString());
    if (q) next.set("q", q);
    else next.delete("q");
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        name="q"
        defaultValue={params.get("q") ?? ""}
        placeholder={placeholder}
        className="w-64 rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none focus:border-olive/40"
      />
      <button
        type="submit"
        className="rounded-full border border-olive px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-lime"
      >
        {label}
      </button>
    </form>
  );
}
```

**Deviasi dari spec §5 — penting.** Spec menulis `search-form.tsx` sebagai "GET form server component biasa, tanpa JavaScript", mengikuti pola `header.tsx:22`. Pola itu tidak bisa dipakai di sini: `/admin/pesanan?status=PAID` punya query param lain yang harus dipertahankan, dan GET form HTML murni **membuang** semua param yang tidak punya input di dalam form — jadi filter status akan hilang setiap kali admin mencari.

Dua pilihan: (a) menambahkan `<input type="hidden">` untuk setiap param yang dipertahankan di setiap halaman, atau (b) client component kecil dengan `router.replace`. Plan ini memilih (b) karena lebih sedikit kode total dan tidak perlu mengingat daftar hidden input per halaman. Konsekuensinya `SearchForm` menjadi client component — satu-satunya tambahan client component di luar yang sudah direncanakan spec.

`next/link` tidak dibutuhkan di sini; `useSearchParams` di client component mengharuskan halaman dibungkus `Suspense` oleh Next saat build. Bila `npm run build` mengeluh `useSearchParams() should be wrapped in a suspense boundary`, bungkus pemakaian `<SearchForm>` di halaman dengan `<Suspense>`:

```tsx
import { Suspense } from "react";
// ...
<Suspense fallback={null}><SearchForm placeholder="Cari nama atau slug…" /></Suspense>
```

- [ ] **Step 6: Buat `TablePager`**

Buat `src/components/admin/table-pager.tsx`:

```tsx
import Link from "next/link";
import { PAGE_SIZE, pageSlice } from "@/lib/pagination";

type Props = {
  total: number;
  page: number;
  searchParams: Record<string, string | undefined>;
};

export function TablePager({ total, page, searchParams }: Props) {
  const { totalPages, hasPrev, hasNext } = pageSlice(total, page);
  if (totalPages <= 1) return <p className="mt-4 text-xs opacity-60">{total} baris</p>;

  const hrefFor = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const linkClass = "rounded-full border border-olive/20 px-3 py-1 hover:bg-lime";
  const deadClass = "rounded-full border border-olive/10 px-3 py-1 opacity-40";

  return (
    <nav className="mt-4 flex items-center gap-4 text-xs font-semibold uppercase tracking-widest">
      {hasPrev ? (
        <Link href={hrefFor(page - 1)} className={linkClass}>← Sebelumnya</Link>
      ) : (
        <span className={deadClass}>← Sebelumnya</span>
      )}
      <span className="opacity-60">{from}–{to} dari {total}</span>
      {hasNext ? (
        <Link href={hrefFor(page + 1)} className={linkClass}>Berikutnya →</Link>
      ) : (
        <span className={deadClass}>Berikutnya →</span>
      )}
    </nav>
  );
}
```

`TablePager` tetap Server Component — ia hanya merender `<Link>`.

- [ ] **Step 7: Wire ke halaman produk**

Ganti seluruh isi `app/admin/produk/page.tsx`:

```tsx
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/action-button";
import { SearchForm } from "@/components/admin/search-form";
import { TablePager } from "@/components/admin/table-pager";
import { formatIDR } from "@/lib/format";
import { parsePage, parseQuery } from "@/lib/pagination";
import { toggleProductActiveAction } from "@/server/actions/admin";
import { listProductsForAdmin } from "@/server/domain/admin-catalog";
import { requireAdmin } from "@/server/session";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const session = await requireAdmin();
  const q = parseQuery(rawQ);
  const page = parsePage(rawPage);
  const result = await listProductsForAdmin(session, { q: q || undefined, page });
  if ("error" in result) return <p className="text-sm">{result.error}</p>;
  const { rows, total } = result;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Produk &amp; Stok</h1>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <SearchForm placeholder="Cari nama atau slug…" />
          </Suspense>
          <Link
            href="/admin/produk/baru"
            className="rounded-full bg-lime px-4 py-2 text-sm font-semibold uppercase tracking-widest"
          >
            Produk Baru
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-olive/20 p-10 text-center text-sm opacity-60">
          {q ? `Tidak ada produk yang cocok dengan "${q}".` : "Belum ada produk."}
        </p>
      ) : (
        <>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-olive/15 text-left text-xs uppercase tracking-widest opacity-70">
                <th className="py-2">Nama</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Total Stok</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-olive/10">
                  <td className="py-2 font-semibold">{r.name}</td>
                  <td>{r.categoryName}</td>
                  <td>{formatIDR(r.basePrice)}</td>
                  <td>{r.totalStock}</td>
                  <td>{r.isActive ? "Aktif" : "Nonaktif"}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/produk/${r.id}/edit`} className="text-xs font-semibold underline">
                        Edit
                      </Link>
                      <ActionButton
                        action={toggleProductActiveAction.bind(null, r.id)}
                        label={r.isActive ? "Nonaktifkan" : "Aktifkan"}
                        confirm={r.isActive ? `Nonaktifkan ${r.name}?` : `Aktifkan ${r.name}?`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager total={total} page={page} searchParams={{ q: q || undefined }} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Typecheck, test penuh, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: semuanya bersih. `vitest run` penuh memastikan tidak ada caller lain `listProductsForAdmin` yang rusak.

- [ ] **Step 9: Verifikasi manual di browser**

Run: `npm run dev`, login sebagai `admin@demo.id` / `admin1234`.

1. Buka `/admin/produk`. Ketik sebagian nama produk → submit → daftar menyempit dan URL jadi `?q=...`.
2. Cari `zzz-tidak-ada` → muncul empty state `Tidak ada produk yang cocok dengan "zzz-tidak-ada".`
3. Kosongkan kotak cari → submit → daftar penuh kembali dan `q` hilang dari URL.
4. Seed demo punya 12–16 produk, jadi pagination belum terlihat. Jalur `TablePager` sudah tertutup unit test `pageSlice` (Task 1) dan test integrasi `memotong hasil per halaman` (Step 1). Untuk melihatnya secara visual, tambahkan sementara baris berikut di `prisma/seed.ts`, jalankan `npm run db:seed`, verifikasi, **lalu hapus kembali dan seed ulang**:

```ts
// SEMENTARA untuk verifikasi pagination — hapus setelah selesai
for (let i = 0; i < 30; i++) {
  const cat = await prisma.category.findFirst();
  await prisma.product.create({
    data: {
      categoryId: cat!.id,
      name: `Produk Uji Pagination ${i}`,
      slug: `uji-pagination-${i}`,
      description: "uji",
      basePrice: 50000,
      images: [],
      variants: { create: { colorName: "Hitam", colorHex: "#111", size: "M", stock: 3, sku: `UJI-${i}` } },
    },
  });
}
```

   Setelah 30 produk tambahan ada: pastikan footer tabel menampilkan `1–25 dari N`, tombol **Berikutnya →** aktif, dan mengkliknya membuka halaman 2 dengan **Sebelumnya** aktif. Pastikan juga `q` bertahan saat pindah halaman.

- [ ] **Step 10: Commit**

```bash
git add src/server/domain/admin-catalog.ts src/components/admin/search-form.tsx src/components/admin/table-pager.tsx app/admin/produk/page.tsx tests/integration/admin-catalog.test.ts
git commit -m "feat: add search and pagination to admin product list"
```

---

### Task 5: Pencarian + pagination untuk pesanan

**Files:**
- Modify: `src/server/domain/orders.ts` (`listOrdersForAdmin`, baris 195-202)
- Modify: `app/admin/pesanan/page.tsx`
- Test: `tests/integration/orders.test.ts` (tambah `describe` baru)

**Interfaces:**
- Consumes: `SearchForm`, `TablePager` (Task 4); `PAGE_SIZE`, `ListResult`, `parsePage`, `parseQuery` (Task 1); `toSummary` privat di `orders.ts`.
- Produces:
  - `listOrdersForAdmin(query?: { status?: OrderStatus; q?: string; page?: number; take?: number }): Promise<ListResult<OrderSummary>>` — **breaking change**: parameter pertama bukan lagi `status?: OrderStatus` dan kembalian bukan lagi array polos.
  - `take` dan `page` saling eksklusif: bila `take` terisi, pagination dilewati dan `total` sama dengan panjang `rows`. Ini yang dipakai dashboard di Task 11.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke import di `tests/integration/orders.test.ts`:

```ts
import { listOrdersForAdmin } from "@/server/domain/orders";
```

Bila file itu belum punya konstanta alamat, tambahkan di atas `describe` baru:

```ts
const address = {
  recipient: "Penerima Uji",
  phone: "08123456789",
  line1: "Jl. Uji No. 1",
  city: "Jakarta",
  province: "DKI Jakarta",
  postalCode: "10110",
};
```

Tambahkan `describe` tingkat atas baru di akhir file:

```ts
describe("listOrdersForAdmin", () => {
  async function placeOne(userId: string) {
    return (await createOrderFromCart(userId, address)) as { ok: true; orderCode: string };
  }

  it("mengembalikan rows dan total tanpa filter", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    await placeOne(user.id);
    const result = await listOrdersForAdmin();
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customerName).toBe(user.name);
  });

  it("memfilter berdasarkan status", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    const { orderCode } = await placeOne(user.id);
    expect((await listOrdersForAdmin({ status: "PAID" })).total).toBe(0);
    expect((await listOrdersForAdmin({ status: "PENDING" })).rows[0].code).toBe(orderCode);
  });

  it("mencari berdasarkan kode pesanan secara case-insensitive", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    const { orderCode } = await placeOne(user.id);
    expect((await listOrdersForAdmin({ q: orderCode.toLowerCase() })).total).toBe(1);
    expect((await listOrdersForAdmin({ q: "zzz-tidak-ada" })).total).toBe(0);
  });

  it("mencari berdasarkan nama pembeli", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    await placeOne(user.id);
    expect((await listOrdersForAdmin({ q: user.name.toUpperCase() })).total).toBe(1);
  });

  it("mencari berdasarkan nama penerima", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    await placeOne(user.id);
    expect((await listOrdersForAdmin({ q: "penerima uji" })).total).toBe(1);
  });

  it("take melewati pagination dan total sama dengan panjang rows", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 50 });
    for (let i = 0; i < 3; i++) {
      await addToCart(user.id, product.variants[0].id, 1);
      await placeOne(user.id);
    }
    const result = await listOrdersForAdmin({ take: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});
```

Sesuaikan nama helper `addToCart`/`createOrderFromCart`/`makeProduct` dengan import yang sudah ada di file test itu; bila belum ada, tambahkan ke import.

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npx vitest run tests/integration/orders.test.ts`
Expected: FAIL — `listOrdersForAdmin` masih menerima `status?: OrderStatus` sebagai parameter pertama dan mengembalikan array polos, sehingga `result.total` adalah `undefined`.

- [ ] **Step 3: Ubah `listOrdersForAdmin`**

Di `src/server/domain/orders.ts`, tambahkan import bila belum ada:

```ts
import { Prisma } from "@prisma/client";
import { PAGE_SIZE, parseQuery, type ListResult } from "@/lib/pagination";
```

Ganti seluruh fungsi `listOrdersForAdmin` (baris 195-202) menjadi:

```ts
export async function listOrdersForAdmin(
  query: { status?: OrderStatus; q?: string; page?: number; take?: number } = {},
): Promise<ListResult<OrderSummary>> {
  const q = parseQuery(query.q);
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { shipRecipient: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const include = {
    items: { select: { qty: true } },
    user: { select: { name: true } },
  } satisfies Prisma.OrderInclude;

  if (query.take !== undefined) {
    const orders = await prisma.order.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: query.take,
    });
    return { rows: orders.map(toSummary), total: orders.length };
  }

  const page = Math.max(1, query.page ?? 1);
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows: orders.map(toSummary), total };
}
```

`listOrdersForAdmin` sengaja **tidak** menerima `actor` dan tidak memanggil `assertRole`, sama seperti sebelum perubahan ini: pemanggilnya adalah halaman di bawah `requireAdmin()` dan `getDashboardMetrics` yang sudah menjaga dirinya sendiri. Jangan tambahkan guard di sini tanpa mengubah kontraknya di spec.

- [ ] **Step 4: Jalankan test dan pastikan lulus**

Run: `npx vitest run tests/integration/orders.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Wire ke halaman pesanan**

Ganti seluruh isi `app/admin/pesanan/page.tsx`:

```tsx
import Link from "next/link";
import { Suspense } from "react";
import type { OrderStatus } from "@prisma/client";
import { SearchForm } from "@/components/admin/search-form";
import { TablePager } from "@/components/admin/table-pager";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { parsePage, parseQuery } from "@/lib/pagination";
import { listOrdersForAdmin } from "@/server/domain/orders";
import { requireAdmin } from "@/server/session";

const TABS: (OrderStatus | undefined)[] = [
  undefined, "PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED",
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { status, q: rawQ, page: rawPage } = await searchParams;
  await requireAdmin();
  const filter = TABS.includes(status as OrderStatus | undefined) ? (status as OrderStatus) : undefined;
  const q = parseQuery(rawQ);
  const page = parsePage(rawPage);
  const { rows, total } = await listOrdersForAdmin({ status: filter, q: q || undefined, page });

  const hrefFor = (tab: OrderStatus | undefined) => {
    const params = new URLSearchParams();
    if (tab) params.set("status", tab);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin/pesanan?${qs}` : "/admin/pesanan";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Pesanan</h1>
        <Suspense fallback={null}>
          <SearchForm placeholder="Cari kode, penerima, atau pembeli…" />
        </Suspense>
      </div>

      <nav className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-widest">
        {TABS.map((t) => (
          <Link
            key={t ?? "all"}
            href={hrefFor(t)}
            className={`rounded-full px-3 py-1 ${filter === t ? "bg-olive text-lime" : "border border-olive/20"}`}
          >
            {t ?? "Semua"}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-olive/20 p-10 text-center text-sm opacity-60">
          {q || filter ? "Tidak ada pesanan yang cocok dengan filter ini." : "Belum ada pesanan."}
        </p>
      ) : (
        <>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-olive/15 text-left text-xs uppercase tracking-widest opacity-70">
                <th className="py-2">Kode</th>
                <th>Customer</th>
                <th>Tanggal</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.code} className="border-b border-olive/10">
                  <td className="py-2">
                    <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">
                      {o.code}
                    </Link>
                  </td>
                  <td>{o.customerName}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString("id-ID")}</td>
                  <td>{formatIDR(o.total)}</td>
                  <td><StatusChip status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager total={total} page={page} searchParams={{ status: filter, q: q || undefined }} />
        </>
      )}
    </div>
  );
}
```

Tab status kini mempertahankan `q`, dan `SearchForm` mempertahankan `status` — keduanya memakai `URLSearchParams` sehingga tidak saling menghapus.

- [ ] **Step 6: Typecheck, test penuh, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: bersih. Bila ada caller lain `listOrdersForAdmin(filter)` yang tersisa, `tsc` akan menangkapnya.

- [ ] **Step 7: Verifikasi manual di browser**

1. Buka `/admin/pesanan`. Klik tab **PAID** → URL jadi `?status=PAID` dan daftar menyempit.
2. Dengan tab PAID masih tersorot, cari satu kode pesanan → URL jadi `?status=PAID&q=ESV-...` dan tab **PAID** tetap tersorot.
3. Klik tab **Semua** → `q` tetap bertahan di URL dan kotak pencarian tetap terisi.
4. Cari `zzz-tidak-ada` → muncul empty state `Tidak ada pesanan yang cocok dengan filter ini.`
5. Klik satu kode pesanan → halaman detail masih berfungsi dan `TransitionButtons` masih muncul.

- [ ] **Step 8: Commit**

```bash
git add src/server/domain/orders.ts app/admin/pesanan/page.tsx tests/integration/orders.test.ts
git commit -m "feat: add search and pagination to admin order list"
```

---

### Task 6: Mutasi pengguna + aturan pengaman

Bagian paling sensitif secara keamanan dari seluruh plan. Semua guard diuji di sini sebelum ada UI yang menyentuhnya.

**Files:**
- Create: `src/server/domain/admin-users.ts`
- Create: `src/server/actions/admin-users.ts`
- Test: `tests/integration/admin-users.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `hashPassword`, `verifyPassword`, `type Session` dari `src/server/session.ts`; `type Result` dari `src/server/domain/cart.ts`.
- Produces:
  - `setUserRole(targetId: string, role: Role, actor: Session | null): Promise<Result>`
  - `setUserSuspended(targetId: string, suspended: boolean, actor: Session | null): Promise<Result>`
  - `resetUserPassword(targetId: string, password: string, actor: Session | null): Promise<Result>`
  - `setUserRoleAction(targetId: string, role: Role): Promise<Result>`
  - `setUserSuspendedAction(targetId: string, suspended: boolean): Promise<Result>`
  - `resetUserPasswordAction(targetId: string, password: string): Promise<Result>`
  - Pesan error **persis** (dipakai assertion test): `"FORBIDDEN"`, `"Pengguna tidak ditemukan."`, `"Tidak bisa mengubah akun sendiri."`, `"Admin terakhir tidak bisa dilucuti."`, `"Admin terakhir tidak bisa ditangguhkan."`, `"Password minimal 8 karakter."`

- [ ] **Step 1: Tulis test yang gagal**

Buat `tests/integration/admin-users.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  resetUserPassword,
  setUserRole,
  setUserSuspended,
} from "@/server/domain/admin-users";
import { verifyPassword, type Session } from "@/server/session";
import { cleanDb, makeUser } from "../helpers/db-factories";

beforeEach(cleanDb);

async function adminSession() {
  const admin = await makeUser("ADMIN");
  return { admin, session: { userId: admin.id, role: "ADMIN" } as Session };
}

describe("setUserRole", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(setUserRole(target.id, "ADMIN", actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("menolak aktor tanpa sesi", async () => {
    const target = await makeUser();
    await expect(setUserRole(target.id, "ADMIN", null)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("mempromosikan customer menjadi admin", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(setUserRole(target.id, "ADMIN", session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.role).toBe("ADMIN");
  });

  it("menurunkan admin menjadi customer bila masih ada admin aktif lain", async () => {
    const { session } = await adminSession();
    const second = await makeUser("ADMIN");
    await expect(setUserRole(second.id, "CUSTOMER", session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: second.id } }))?.role).toBe("CUSTOMER");
  });

  it("menolak mengubah akun sendiri meski masih ada admin lain", async () => {
    const { admin, session } = await adminSession();
    await makeUser("ADMIN");
    await expect(setUserRole(admin.id, "CUSTOMER", session)).resolves.toEqual({
      error: "Tidak bisa mengubah akun sendiri.",
    });
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.role).toBe("ADMIN");
  });

  it("menolak melucuti admin terakhir yang masih aktif", async () => {
    const first = await makeUser("ADMIN");
    const second = await makeUser("ADMIN");
    await prisma.user.update({ where: { id: first.id }, data: { suspendedAt: new Date() } });
    const secondSession: Session = { userId: second.id, role: "ADMIN" };
    await expect(setUserRole(second.id, "CUSTOMER", secondSession)).resolves.toEqual({
      error: "Admin terakhir tidak bisa dilucuti.",
    });
    expect((await prisma.user.findUnique({ where: { id: second.id } }))?.role).toBe("ADMIN");
  });

  it("menolak target yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(setUserRole("tidak-ada", "ADMIN", session)).resolves.toEqual({
      error: "Pengguna tidak ditemukan.",
    });
  });
});

describe("setUserSuspended", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(setUserSuspended(target.id, true, actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("menangguhkan lalu mengaktifkan kembali", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(setUserSuspended(target.id, true, session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.suspendedAt).toBeInstanceOf(Date);

    await expect(setUserSuspended(target.id, false, session)).resolves.toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.suspendedAt).toBeNull();
  });

  it("menolak menangguhkan akun sendiri", async () => {
    const { admin, session } = await adminSession();
    await expect(setUserSuspended(admin.id, true, session)).resolves.toEqual({
      error: "Tidak bisa mengubah akun sendiri.",
    });
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.suspendedAt).toBeNull();
  });

  it("menolak menangguhkan admin aktif terakhir", async () => {
    const first = await makeUser("ADMIN");
    const second = await makeUser("ADMIN");
    await prisma.user.update({ where: { id: first.id }, data: { role: "CUSTOMER" } });
    const secondSession: Session = { userId: second.id, role: "ADMIN" };
    await expect(setUserSuspended(second.id, true, secondSession)).resolves.toEqual({
      error: "Admin terakhir tidak bisa ditangguhkan.",
    });
    expect((await prisma.user.findUnique({ where: { id: second.id } }))?.suspendedAt).toBeNull();
  });

  it("mengizinkan menangguhkan customer", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(setUserSuspended(target.id, true, session)).resolves.toEqual({ ok: true });
  });

  it("menolak target yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(setUserSuspended("tidak-ada", true, session)).resolves.toEqual({
      error: "Pengguna tidak ditemukan.",
    });
  });
});

describe("resetUserPassword", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(resetUserPassword(target.id, "passwordbaru1", actor)).resolves.toEqual({
      error: "FORBIDDEN",
    });
  });

  it("mengganti password sehingga yang baru lolos dan yang lama gagal", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(resetUserPassword(target.id, "passwordbaru1", session)).resolves.toEqual({ ok: true });
    const hash = (await prisma.user.findUnique({ where: { id: target.id } }))!.passwordHash;
    await expect(verifyPassword("passwordbaru1", hash)).resolves.toBe(true);
    await expect(verifyPassword("rahasia123", hash)).resolves.toBe(false);
  });

  it("menolak password di bawah 8 karakter tanpa mengubah hash", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await expect(resetUserPassword(target.id, "pendek", session)).resolves.toEqual({
      error: "Password minimal 8 karakter.",
    });
    const hash = (await prisma.user.findUnique({ where: { id: target.id } }))!.passwordHash;
    await expect(verifyPassword("rahasia123", hash)).resolves.toBe(true);
  });

  it("boleh mengganti password akun sendiri", async () => {
    const { admin, session } = await adminSession();
    await expect(resetUserPassword(admin.id, "passwordbaru1", session)).resolves.toEqual({ ok: true });
  });

  it("menolak target yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(resetUserPassword("tidak-ada", "passwordbaru1", session)).resolves.toEqual({
      error: "Pengguna tidak ditemukan.",
    });
  });
});
```

`makeUser()` dari factory memakai password `"rahasia123"` (lihat `tests/helpers/factories.ts:12`), jadi test bisa memverifikasi password lama secara langsung.

Guard "admin terakhir" dihitung hanya dari admin yang **aktif** (`suspendedAt: null`). Karena itu test-nya menonaktifkan admin lain lebih dulu lewat `suspendedAt` atau `role`, bukan dengan menghapusnya.

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npx vitest run tests/integration/admin-users.test.ts`
Expected: FAIL — modul `@/server/domain/admin-users` belum ada.

- [ ] **Step 3: Implementasi domain**

Buat `src/server/domain/admin-users.ts`:

```ts
import type { Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertRole, hashPassword, type Session } from "@/server/session";
import type { Result } from "@/server/domain/cart";

async function countOtherActiveAdmins(excludeId: string): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", suspendedAt: null, id: { not: excludeId } },
  });
}

export async function setUserRole(targetId: string, role: Role, actor: Session | null): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  if (targetId === actor!.userId) return { error: "Tidak bisa mengubah akun sendiri." };
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  if (target.role === "ADMIN" && role !== "ADMIN" && (await countOtherActiveAdmins(targetId)) === 0) {
    return { error: "Admin terakhir tidak bisa dilucuti." };
  }
  await prisma.user.update({ where: { id: targetId }, data: { role } });
  return { ok: true };
}

export async function setUserSuspended(
  targetId: string,
  suspended: boolean,
  actor: Session | null,
): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  if (targetId === actor!.userId) return { error: "Tidak bisa mengubah akun sendiri." };
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  const wouldStripLastAdmin =
    suspended &&
    target.suspendedAt === null &&
    target.role === "ADMIN" &&
    (await countOtherActiveAdmins(targetId)) === 0;
  if (wouldStripLastAdmin) return { error: "Admin terakhir tidak bisa ditangguhkan." };
  await prisma.user.update({
    where: { id: targetId },
    data: { suspendedAt: suspended ? new Date() : null },
  });
  return { ok: true };
}

export async function resetUserPassword(
  targetId: string,
  password: string,
  actor: Session | null,
): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash: await hashPassword(password) },
  });
  return { ok: true };
}
```

Validasi panjang password dijalankan **sebelum** query DB supaya tidak membocorkan keberadaan user lewat perbedaan waktu respons.

- [ ] **Step 4: Jalankan test dan pastikan lulus**

Run: `npx vitest run tests/integration/admin-users.test.ts`
Expected: PASS semua (18 test).

- [ ] **Step 5: Buat server actions**

Buat `src/server/actions/admin-users.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { getCurrentSession } from "@/server/session";
import type { Result } from "@/server/domain/cart";
import { resetUserPassword, setUserRole, setUserSuspended } from "@/server/domain/admin-users";

function revalidateUser(targetId: string) {
  revalidatePath("/admin/pengguna");
  revalidatePath(`/admin/pengguna/${targetId}`);
}

export async function setUserRoleAction(targetId: string, role: Role): Promise<Result> {
  const session = await getCurrentSession();
  const result = await setUserRole(targetId, role, session);
  if ("error" in result) return result;
  revalidateUser(targetId);
  return result;
}

export async function setUserSuspendedAction(targetId: string, suspended: boolean): Promise<Result> {
  const session = await getCurrentSession();
  const result = await setUserSuspended(targetId, suspended, session);
  if ("error" in result) return result;
  revalidateUser(targetId);
  return result;
}

export async function resetUserPasswordAction(targetId: string, password: string): Promise<Result> {
  const session = await getCurrentSession();
  const result = await resetUserPassword(targetId, password, session);
  if ("error" in result) return result;
  revalidateUser(targetId);
  return result;
}
```

`revalidatePath` sengaja presisi — hanya dua path pengguna, tidak seluruh pohon admin. Action memakai `getCurrentSession()` lalu menyerahkan otorisasi ke domain, persis pola `src/server/actions/admin.ts` yang sudah ada: guard ganda ini disengaja karena Server Action adalah endpoint POST yang bisa dicapai langsung tanpa melewati layout.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: bersih.

- [ ] **Step 7: Commit**

```bash
git add src/server/domain/admin-users.ts src/server/actions/admin-users.ts tests/integration/admin-users.test.ts
git commit -m "feat: add admin user mutations with self and last-admin guards"
```

---

### Task 7: Query list & detail pengguna

**Files:**
- Modify: `src/server/domain/admin-users.ts` (tambah query di bawah mutasi)
- Test: `tests/integration/admin-users.test.ts` (tambah dua `describe`)

**Interfaces:**
- Consumes: `PAGE_SIZE`, `ListResult` dari `src/lib/pagination.ts`; `AddressInput`, `OrderSummary`, `listOrdersForUser` dari `src/server/domain/orders.ts`; `setUserSuspended` dari Task 6.
- Produces:
  ```ts
  export type AdminUserRow = {
    id: string; name: string; email: string; role: Role;
    suspendedAt: Date | null; createdAt: Date;
    orderCount: number; totalSpent: number;
  };
  export type AdminUserDetail = AdminUserRow & {
    addresses: AddressInput[];
    orders: OrderSummary[];
  };
  export type AdminUserQuery = { q?: string; role?: Role; status?: "active" | "suspended"; page?: number };
  export async function listUsersForAdmin(actor: Session | null, query?: AdminUserQuery): Promise<ListResult<AdminUserRow> | { error: string }>;
  export async function getUserForAdmin(targetId: string, actor: Session | null): Promise<AdminUserDetail | null | { error: string }>;
  ```

- [ ] **Step 1: Tulis test yang gagal**

Lengkapi import di `tests/integration/admin-users.test.ts`:

```ts
import { addToCart } from "@/server/domain/cart";
import { createOrderFromCart, transitionOrder } from "@/server/domain/orders";
import { getUserForAdmin, listUsersForAdmin } from "@/server/domain/admin-users";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";
```

Tambahkan helper dan dua `describe` di akhir file:

```ts
const ADDRESS = {
  recipient: "Penerima Uji",
  phone: "08123456789",
  line1: "Jl. Uji No. 1",
  city: "Jakarta",
  province: "DKI Jakarta",
  postalCode: "10110",
};

async function paidOrderFor(userId: string) {
  const cat = await makeCategory();
  const product = await makeProduct(cat.id, { stock: 20 });
  await addToCart(userId, product.variants[0].id, 1);
  const created = (await createOrderFromCart(userId, ADDRESS)) as { ok: true; orderCode: string };
  const order = await prisma.order.findUniqueOrThrow({ where: { code: created.orderCode } });
  await transitionOrder(order.id, "PAID");
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

describe("listUsersForAdmin", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(listUsersForAdmin(actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("menghitung total belanja hanya dari pesanan yang dibayar", async () => {
    const { session } = await adminSession();
    const buyer = await makeUser();
    const paid = await paidOrderFor(buyer.id);

    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 20 });
    await addToCart(buyer.id, product.variants[0].id, 1);
    const cancelledCreated = (await createOrderFromCart(buyer.id, ADDRESS)) as { orderCode: string };
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { code: cancelledCreated.orderCode } });
    await transitionOrder(cancelled.id, "CANCELLED");

    const result = await listUsersForAdmin(session, { q: buyer.email });
    expect("error" in result).toBe(false);
    const { rows, total } = result as { rows: { orderCount: number; totalSpent: number }[]; total: number };
    expect(total).toBe(1);
    expect(rows[0].orderCount).toBe(1);
    expect(rows[0].totalSpent).toBe(paid.total);
  });

  it("memfilter berdasarkan role", async () => {
    const { admin, session } = await adminSession();
    await makeUser();
    const result = await listUsersForAdmin(session, { role: "ADMIN" });
    expect((result as { total: number }).total).toBe(1);
    expect((result as { rows: { id: string }[] }).rows[0].id).toBe(admin.id);
  });

  it("memfilter berdasarkan status suspensi", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await setUserSuspended(target.id, true, session);
    expect((await listUsersForAdmin(session, { status: "suspended" }) as { total: number }).total).toBe(1);
    expect((await listUsersForAdmin(session, { status: "active" }) as { total: number }).total).toBe(1);
  });

  it("mencari nama dan email secara case-insensitive", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    expect((await listUsersForAdmin(session, { q: target.name.toUpperCase() }) as { total: number }).total).toBe(1);
    expect((await listUsersForAdmin(session, { q: target.email.toUpperCase() }) as { total: number }).total).toBe(1);
    expect((await listUsersForAdmin(session, { q: "zzz-tidak-ada" }) as { total: number }).total).toBe(0);
  });

  it("memotong hasil per halaman", async () => {
    const { session } = await adminSession();
    for (let i = 0; i < 26; i++) await makeUser();
    const page1 = await listUsersForAdmin(session, { page: 1 });
    const page2 = await listUsersForAdmin(session, { page: 2 });
    expect((page1 as { rows: unknown[] }).rows).toHaveLength(25);
    expect((page2 as { rows: unknown[] }).rows).toHaveLength(2);
    expect((page2 as { total: number }).total).toBe(27);
  });
});

describe("getUserForAdmin", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(getUserForAdmin(target.id, actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("mengembalikan null untuk id yang tidak ada", async () => {
    const { session } = await adminSession();
    await expect(getUserForAdmin("tidak-ada", session)).resolves.toBeNull();
  });

  it("menyertakan alamat, riwayat pesanan, dan agregat belanja", async () => {
    const { session } = await adminSession();
    const target = await makeUser();
    await prisma.address.create({ data: { userId: target.id, ...ADDRESS, isDefault: true } });
    const paid = await paidOrderFor(target.id);

    const detail = (await getUserForAdmin(target.id, session)) as {
      addresses: { recipient: string }[];
      orders: { code: string }[];
      orderCount: number;
      totalSpent: number;
      email: string;
    };
    expect(detail.email).toBe(target.email);
    expect(detail.addresses).toHaveLength(1);
    expect(detail.addresses[0].recipient).toBe("Penerima Uji");
    expect(detail.orders.map((o) => o.code)).toContain(paid.code);
    expect(detail.orderCount).toBe(1);
    expect(detail.totalSpent).toBe(paid.total);
  });
});
```

Ekspektasi `totalSpent` dibaca dari `paid.total` alih-alih angka literal, karena `makeProduct` menambah nomor urut global ke `basePrice` sehingga nominalnya bergantung pada urutan pemanggilan factory.

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npx vitest run tests/integration/admin-users.test.ts`
Expected: FAIL — `listUsersForAdmin` dan `getUserForAdmin` belum diekspor. Test Task 6 harus tetap hijau.

- [ ] **Step 3: Implementasi query**

Tambahkan import di bagian atas `src/server/domain/admin-users.ts`:

```ts
import { Prisma } from "@prisma/client";
import { PAGE_SIZE, parseQuery, type ListResult } from "@/lib/pagination";
import { listOrdersForUser, type AddressInput, type OrderSummary } from "@/server/domain/orders";
```

Tambahkan di akhir file yang sama:

```ts
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  suspendedAt: Date | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
};

export type AdminUserDetail = AdminUserRow & {
  addresses: AddressInput[];
  orders: OrderSummary[];
};

export type AdminUserQuery = {
  q?: string;
  role?: Role;
  status?: "active" | "suspended";
  page?: number;
};

const SPENT_STATUSES = { notIn: ["PENDING", "CANCELLED"] as const };

export async function listUsersForAdmin(
  actor: Session | null,
  query: AdminUserQuery = {},
): Promise<ListResult<AdminUserRow> | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const page = Math.max(1, query.page ?? 1);
  const q = parseQuery(query.q);
  const where: Prisma.UserWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status === "active" ? { suspendedAt: null } : {}),
    ...(query.status === "suspended" ? { suspendedAt: { not: null } } : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const spend = await prisma.order.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, status: SPENT_STATUSES },
    _count: { _all: true },
    _sum: { total: true },
  });
  const byUser = new Map(spend.map((s) => [s.userId, s]));
  return {
    total,
    rows: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      suspendedAt: u.suspendedAt,
      createdAt: u.createdAt,
      orderCount: byUser.get(u.id)?._count._all ?? 0,
      totalSpent: byUser.get(u.id)?._sum.total ?? 0,
    })),
  };
}

export async function getUserForAdmin(
  targetId: string,
  actor: Session | null,
): Promise<AdminUserDetail | null | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const user = await prisma.user.findUnique({ where: { id: targetId }, include: { addresses: true } });
  if (!user) return null;
  const [agg, orders] = await Promise.all([
    prisma.order.aggregate({
      where: { userId: targetId, status: SPENT_STATUSES },
      _count: { _all: true },
      _sum: { total: true },
    }),
    listOrdersForUser(targetId),
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    suspendedAt: user.suspendedAt,
    createdAt: user.createdAt,
    orderCount: agg._count._all,
    totalSpent: agg._sum.total ?? 0,
    addresses: user.addresses.map((a) => ({
      recipient: a.recipient,
      phone: a.phone,
      line1: a.line1,
      city: a.city,
      province: a.province,
      postalCode: a.postalCode,
    })),
    orders,
  };
}
```

Agregasi belanja dibatasi ke id pengguna pada halaman aktif (`userId: { in: [...] }`), jadi `groupBy` tidak pernah memindai seluruh tabel `Order`.

- [ ] **Step 4: Jalankan test dan pastikan lulus**

Run: `npx vitest run tests/integration/admin-users.test.ts`
Expected: PASS semua (27 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/admin-users.ts tests/integration/admin-users.test.ts
git commit -m "feat: add admin user list and detail queries with spend aggregation"
```

---

### Task 8: Halaman manajemen pengguna

**Files:**
- Create: `app/admin/pengguna/page.tsx`
- Create: `app/admin/pengguna/[id]/page.tsx`
- Create: `src/components/admin/reset-password-form.tsx`

**Interfaces:**
- Consumes: `listUsersForAdmin`, `getUserForAdmin`, `AdminUserRow`, `AdminUserDetail` (Task 7); `setUserRoleAction`, `setUserSuspendedAction`, `resetUserPasswordAction` (Task 6); `ActionButton` (Task 3); `SearchForm`, `TablePager` (Task 4); `parsePage`, `parseQuery` (Task 1); `formatIDR` dari `src/lib/format.ts`; `StatusChip` dari `src/components/storefront/status-chip.tsx`.
- Produces: rute `/admin/pengguna` dan `/admin/pengguna/[id]`.

- [ ] **Step 1: Buat `ResetPasswordForm`**

Buat `src/components/admin/reset-password-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { resetUserPasswordAction } from "@/server/actions/admin-users";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function openForm() {
    setMessage(null);
    setOpen(true);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password")?.toString() ?? "";
    start(async () => {
      const result = await resetUserPasswordAction(userId, password);
      if ("error" in result) {
        setMessage(result.error);
      } else {
        setMessage("Password berhasil diganti.");
        setOpen(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password baru (min. 8 karakter)"
            className="w-64 rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none focus:border-olive/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-lime px-4 py-2 text-xs font-semibold uppercase tracking-widest disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-semibold uppercase tracking-widest opacity-60"
          >
            Batal
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={openForm}
          className="self-start rounded-full border border-olive/20 px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-lime"
        >
          Reset Password
        </button>
      )}

      {message && <p className="text-xs font-semibold">{message}</p>}

      <p className="text-xs opacity-60">
        Mengganti password tidak mencabut sesi yang sedang aktif. Gunakan <b>Tangguhkan</b> untuk mencabut akses seketika.
      </p>
    </div>
  );
}
```

Pesan **wajib** dirender di luar percabangan `open ? ... : ...`. Sukses menutup form (`setOpen(false)`), jadi kalau `message` ikut berada di dalam cabang form yang terbuka, pesan `Password berhasil diganti.` tidak akan pernah terlihat.

Komponen ini punya state sendiri (`open`), jadi tidak bisa direduksi menjadi `ActionButton`. Yang menyeberang batas server → client hanya `userId` (string).

- [ ] **Step 2: Buat halaman list**

Buat `app/admin/pengguna/page.tsx`:

```tsx
import Link from "next/link";
import { Suspense } from "react";
import type { Role } from "@prisma/client";
import { ActionButton } from "@/components/admin/action-button";
import { SearchForm } from "@/components/admin/search-form";
import { TablePager } from "@/components/admin/table-pager";
import { formatIDR } from "@/lib/format";
import { parsePage, parseQuery } from "@/lib/pagination";
import { setUserRoleAction, setUserSuspendedAction } from "@/server/actions/admin-users";
import { listUsersForAdmin } from "@/server/domain/admin-users";
import { requireAdmin } from "@/server/session";

const ROLES: (Role | undefined)[] = [undefined, "ADMIN", "CUSTOMER"];
const STATUSES: ("active" | "suspended" | undefined)[] = [undefined, "active", "suspended"];
const ROLE_LABEL: Record<string, string> = { all: "Semua Role", ADMIN: "Admin", CUSTOMER: "Customer" };
const STATUS_LABEL: Record<string, string> = {
  all: "Semua Status",
  active: "Aktif",
  suspended: "Ditangguhkan",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const { q: rawQ, role: rawRole, status: rawStatus, page: rawPage } = await searchParams;
  const session = await requireAdmin();
  const q = parseQuery(rawQ);
  const page = parsePage(rawPage);
  const role = ROLES.includes(rawRole as Role | undefined) ? (rawRole as Role) : undefined;
  const status = STATUSES.includes(rawStatus as "active" | "suspended" | undefined)
    ? (rawStatus as "active" | "suspended")
    : undefined;

  const result = await listUsersForAdmin(session, { q: q || undefined, role, status, page });
  if ("error" in result) return <p className="text-sm">{result.error}</p>;
  const { rows, total } = result;

  const hrefFor = (nextRole: Role | undefined, nextStatus: string | undefined) => {
    const params = new URLSearchParams();
    if (nextRole) params.set("role", nextRole);
    if (nextStatus) params.set("status", nextStatus);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin/pengguna?${qs}` : "/admin/pengguna";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Pengguna</h1>
        <Suspense fallback={null}>
          <SearchForm placeholder="Cari nama atau email…" />
        </Suspense>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
        {ROLES.map((r) => (
          <Link
            key={r ?? "all"}
            href={hrefFor(r, status)}
            className={`rounded-full px-3 py-1 ${role === r ? "bg-olive text-lime" : "border border-olive/20"}`}
          >
            {ROLE_LABEL[r ?? "all"]}
          </Link>
        ))}
        <span className="opacity-30">|</span>
        {STATUSES.map((s) => (
          <Link
            key={s ?? "all"}
            href={hrefFor(role, s)}
            className={`rounded-full px-3 py-1 ${status === s ? "bg-olive text-lime" : "border border-olive/20"}`}
          >
            {STATUS_LABEL[s ?? "all"]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-olive/20 p-10 text-center text-sm opacity-60">
          {q || role || status ? "Tidak ada pengguna yang cocok dengan filter ini." : "Belum ada pengguna."}
        </p>
      ) : (
        <>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-olive/15 text-left text-xs uppercase tracking-widest opacity-70">
                <th className="py-2">Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Pesanan</th>
                <th>Total Belanja</th>
                <th>Daftar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.id === session.userId;
                return (
                  <tr key={u.id} className="border-b border-olive/10">
                    <td className="py-2">
                      <Link href={`/admin/pengguna/${u.id}`} className="font-semibold underline">
                        {u.name}
                      </Link>
                      {isSelf && <span className="ml-2 text-xs opacity-50">(kamu)</span>}
                    </td>
                    <td className="opacity-80">{u.email}</td>
                    <td>{u.role === "ADMIN" ? "Admin" : "Customer"}</td>
                    <td>
                      {u.suspendedAt ? (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900">
                          Ditangguhkan
                        </span>
                      ) : (
                        <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-olive">
                          Aktif
                        </span>
                      )}
                    </td>
                    <td>{u.orderCount}</td>
                    <td>{formatIDR(u.totalSpent)}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString("id-ID")}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <ActionButton
                          action={setUserRoleAction.bind(null, u.id, u.role === "ADMIN" ? "CUSTOMER" : "ADMIN")}
                          label={u.role === "ADMIN" ? "Demote" : "Promote"}
                          confirm={
                            u.role === "ADMIN"
                              ? `Turunkan ${u.name} menjadi customer?`
                              : `Naikkan ${u.name} menjadi admin?`
                          }
                        />
                        <ActionButton
                          action={setUserSuspendedAction.bind(null, u.id, !u.suspendedAt)}
                          label={u.suspendedAt ? "Aktifkan" : "Tangguhkan"}
                          confirm={u.suspendedAt ? `Aktifkan kembali ${u.name}?` : `Tangguhkan ${u.name}?`}
                          variant={u.suspendedAt ? "plain" : "danger"}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePager total={total} page={page} searchParams={{ q: q || undefined, role, status }} />
        </>
      )}
    </div>
  );
}
```

Kedua `ActionButton` memakai `.bind(null, ...)` karena halaman ini Server Component. Tombol pada baris akun sendiri **tetap dirender** — guard ada di domain, dan menolak di server dengan toast lebih jujur daripada menyembunyikan tombol yang membuat admin bertanya-tanya.

- [ ] **Step 3: Buat halaman detail**

Buat `app/admin/pengguna/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { setUserRoleAction, setUserSuspendedAction } from "@/server/actions/admin-users";
import { getUserForAdmin } from "@/server/domain/admin-users";
import { requireAdmin } from "@/server/session";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAdmin();
  const user = await getUserForAdmin(id, session);
  if (user === null) notFound();
  if ("error" in user) return <p className="text-sm">{user.error}</p>;

  const isSelf = user.id === session.userId;
  const average = user.orderCount === 0 ? 0 : Math.round(user.totalSpent / user.orderCount);
  const roleBadge =
    user.role === "ADMIN" ? "bg-olive text-lime" : "border border-olive/20 text-olive";

  return (
    <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">{user.name}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${roleBadge}`}>
            {user.role === "ADMIN" ? "Admin" : "Customer"}
          </span>
          {user.suspendedAt ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900">
              Ditangguhkan
            </span>
          ) : (
            <span className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-olive">Aktif</span>
          )}
          {isSelf && <span className="text-xs opacity-50">(akun kamu sendiri)</span>}
        </div>
        <p className="mt-1 text-sm opacity-70">
          {user.email} · terdaftar {new Date(user.createdAt).toLocaleDateString("id-ID")}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs uppercase tracking-widest opacity-60">Pesanan</p>
            <p className="text-2xl font-extrabold">{user.orderCount}</p>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs uppercase tracking-widest opacity-60">Total Belanja</p>
            <p className="text-2xl font-extrabold">{formatIDR(user.totalSpent)}</p>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs uppercase tracking-widest opacity-60">Rata-rata</p>
            <p className="text-2xl font-extrabold">
              {user.orderCount === 0 ? "—" : formatIDR(average)}
            </p>
          </div>
        </div>

        <h2 className="mt-8 text-sm font-bold uppercase tracking-widest">Riwayat Pesanan</h2>
        {user.orders.length === 0 ? (
          <p className="mt-3 text-sm opacity-60">Belum ada pesanan.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {user.orders.map((o) => (
              <li key={o.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-olive/10 pb-2">
                <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">
                  {o.code}
                </Link>
                <span className="opacity-70">{new Date(o.createdAt).toLocaleDateString("id-ID")}</span>
                <span>{formatIDR(o.total)}</span>
                <StatusChip status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="flex h-fit flex-col gap-6 rounded-2xl border border-olive/10 bg-white p-6 text-sm">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest">Aksi Admin</h2>
          <div className="mt-3 flex flex-col items-start gap-2">
            <ActionButton
              action={setUserRoleAction.bind(null, user.id, user.role === "ADMIN" ? "CUSTOMER" : "ADMIN")}
              label={user.role === "ADMIN" ? "Turunkan jadi Customer" : "Naikkan jadi Admin"}
              confirm={
                user.role === "ADMIN"
                  ? `Turunkan ${user.name} menjadi customer?`
                  : `Naikkan ${user.name} menjadi admin?`
              }
            />
            <ActionButton
              action={setUserSuspendedAction.bind(null, user.id, !user.suspendedAt)}
              label={user.suspendedAt ? "Aktifkan Kembali" : "Tangguhkan Akun"}
              confirm={user.suspendedAt ? `Aktifkan kembali ${user.name}?` : `Tangguhkan ${user.name}?`}
              variant={user.suspendedAt ? "plain" : "danger"}
            />
          </div>
          {isSelf && (
            <p className="mt-2 text-xs opacity-60">
              Aksi role dan suspensi akan ditolak server untuk akun sendiri.
            </p>
          )}
          <div className="mt-4">
            <ResetPasswordForm userId={user.id} />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest">Alamat Tersimpan</h2>
          {user.addresses.length === 0 ? (
            <p className="mt-2 text-xs opacity-60">Belum ada alamat.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3 text-xs">
              {user.addresses.map((a, i) => (
                <li key={i} className="border-b border-olive/10 pb-2">
                  <p className="font-semibold">
                    {a.recipient} · {a.phone}
                  </p>
                  <p className="opacity-70">
                    {a.line1}, {a.city}, {a.province} {a.postalCode}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link href="/admin/pengguna" className="text-xs underline">
          ← Semua pengguna
        </Link>
      </aside>
    </div>
  );
}
```

`notFound()` dipanggil sebelum pengecekan `"error" in user` karena `getUserForAdmin` mengembalikan `null` untuk id yang tidak ada dan `{ error }` hanya untuk `FORBIDDEN`.

- [ ] **Step 4: Typecheck dan build**

Run: `npx tsc --noEmit && npm run build`
Expected: bersih.

- [ ] **Step 5: Verifikasi manual di browser — termasuk guard dan enforcement login**

Run: `npm run dev`. Login sebagai `admin@demo.id` / `admin1234`.

1. Buka `/admin/pengguna` langsung lewat URL. Pastikan daftar terisi dan kolom Total Belanja serta Pesanan masuk akal.
2. Cari `customer@demo.id` → hanya satu baris. Klik namanya → halaman detail terbuka dengan riwayat pesanan dan alamat.
3. Di detail `customer@demo.id`, klik **Naikkan jadi Admin** → konfirmasi → badge berubah jadi "Admin".
4. **Uji enforcement role seketika** (bug laten yang diperbaiki Task 2): buka tab penyamaran, login sebagai `customer@demo.id` / `customer1234`, lalu buka `/admin`. Seharusnya **langsung masuk** tanpa perlu logout-login ulang, karena role kini dibaca dari DB.
5. Kembali ke tab admin, klik **Turunkan jadi Customer**. Refresh tab penyamaran di `/admin` → seharusnya terlempar ke `/`.
6. **Uji suspend:** di tab admin, klik **Tangguhkan Akun** pada `customer@demo.id`. Di tab penyamaran buka `/cart` atau `/akun/pesanan` → terlempar ke `/login`.
7. **Uji login ditolak** (memverifikasi perubahan `loginAction` di Task 2 Step 7): logout di tab penyamaran, lalu login lagi sebagai `customer@demo.id` / `customer1234` → muncul pesan `Akun ditangguhkan.`
8. **Uji toast error `ActionButton`:** di `/admin/pengguna`, cari baris `admin@demo.id` (bertanda "(kamu)"). Klik **Tangguhkan** → konfirmasi → muncul **toast merah** di kanan bawah berisi `Tidak bisa mengubah akun sendiri.`, hilang sendiri setelah ±5 detik, dan status tidak berubah.
9. **Uji reset password:** aktifkan kembali `customer@demo.id`, buka detailnya, klik **Reset Password**, isi `passwordbaru123`, klik Simpan → form menutup dan muncul teks `Password berhasil diganti.` di bawah tombol. Logout di tab penyamaran, login dengan password baru → berhasil.
10. **Uji validasi password pendek:** buka lagi form reset dan coba submit `abc` → ditolak browser karena `minLength={8}`. Jalur domain-nya (`Password minimal 8 karakter.`) sudah tertutup test Task 6.
11. **Uji filter:** klik **Admin**, lalu **Ditangguhkan**, lalu **Semua Status**. Pastikan `q` bertahan di URL selama filter diklik.
12. Buka `/admin/pengguna/tidak-ada` → halaman 404 Next.

Expected: semua langkah berperilaku seperti tertulis.

- [ ] **Step 6: Commit**

```bash
git add app/admin/pengguna src/components/admin/reset-password-form.tsx
git commit -m "feat: add admin user management pages with role, suspend, and password reset"
```

---

### Task 9: Admin shell

Ditempatkan setelah Task 8 supaya keempat rute navigasi sudah ada saat shell dipasang — tidak ada rute yang 404 di tengah jalan.

**Files:**
- Create: `src/components/admin/admin-shell.tsx`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes: `requireAdmin(): Promise<AdminSession>` dengan `name` dan `email` (Task 2); `logoutAction` dari `src/server/actions/auth.ts`.
- Produces:
  ```ts
  export function AdminShell(props: {
    adminName: string;
    adminEmail: string;
    children: React.ReactNode;
  }): JSX.Element
  ```

- [ ] **Step 1: Buat `AdminShell`**

Buat `src/components/admin/admin-shell.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/pesanan", label: "Pesanan" },
  { href: "/admin/produk", label: "Produk & Stok" },
  { href: "/admin/pengguna", label: "Pengguna" },
];

const CRUMB: Record<string, string> = {
  admin: "Admin",
  pesanan: "Pesanan",
  produk: "Produk & Stok",
  pengguna: "Pengguna",
  baru: "Baru",
  edit: "Edit",
};

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  adminName,
  adminEmail,
  children,
}: {
  adminName: string;
  adminEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col bg-cream md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 overflow-x-auto bg-olive px-4 py-4 text-cream md:w-56 md:overflow-visible md:py-6">
        <p className="mb-3 hidden px-3 text-xs font-bold uppercase tracking-widest text-lime md:block">
          Easternstack <span className="font-light text-cream">Admin</span>
        </p>
        <nav className="flex gap-1 md:flex-col">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${
                  active ? "bg-lime text-olive" : "opacity-70 hover:bg-white/10 hover:opacity-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/"
          className="mt-auto whitespace-nowrap rounded-full px-3 py-2 text-sm opacity-50 hover:opacity-100"
        >
          &larr; Toko
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-olive/10 px-6 py-4">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest"
          >
            {segments.map((segment, i) => {
              const href = `/${segments.slice(0, i + 1).join("/")}`;
              const label = CRUMB[segment] ?? segment;
              const last = i === segments.length - 1;
              return (
                <span key={href} className="flex items-center gap-2">
                  {i > 0 && <span className="opacity-30">/</span>}
                  {last ? (
                    <span className="opacity-90">{label}</span>
                  ) : (
                    <Link href={href} className="opacity-50 hover:opacity-100">
                      {label}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs">
              <p className="font-bold">{adminName}</p>
              <p className="opacity-60">{adminEmail}</p>
            </div>
            <form action={logoutAction}>
              <button className="rounded-full border border-olive/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest hover:bg-lime">
                Keluar
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
```

`logoutAction` diimpor langsung ke dalam client component — ini pola yang didukung Next.js: modul `"use server"` menjadi server reference saat diimpor dari client. **Jangan** mencoba meneruskannya sebagai prop dari layout, karena fungsi tidak serializable.

`children` tetap Server Component; meneruskannya sebagai prop ke client component adalah pola yang didukung dan tidak mengubah halaman menjadi client.

- [ ] **Step 2: Tulis ulang layout**

Ganti seluruh isi `app/admin/layout.tsx`:

```tsx
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <AdminShell adminName={session.name} adminEmail={session.email}>
      {children}
    </AdminShell>
  );
}
```

Guard tetap di layout seperti sebelumnya, jadi tidak ada query DB tambahan — `name` dan `email` sudah ikut dimuat oleh `loadSessionUser()` di Task 2.

- [ ] **Step 3: Typecheck dan build**

Run: `npx tsc --noEmit && npm run build`
Expected: bersih.

- [ ] **Step 4: Verifikasi manual di browser**

Run: `npm run dev`, login sebagai `admin@demo.id` / `admin1234`.

1. Buka `/admin/pesanan`. Sidebar olive gelap di kiri, item **Pesanan** tersorot lime. Topbar menampilkan breadcrumb `Admin / Pesanan` dan identitas admin di kanan.
2. Klik satu kode pesanan. Breadcrumb jadi `Admin / Pesanan / ESV-...`, dan **Pesanan** tetap tersorot karena `startsWith`.
3. Buka `/admin/produk/baru`. Breadcrumb `Admin / Produk & Stok / Baru`; **Produk & Stok** tersorot, **Dashboard** tidak.
4. Buka `/admin`. **Dashboard** tersorot. Isi halaman masih redirect ke produk sampai Task 11 — itu diharapkan.
5. **Uji responsif:** persempit jendela ke bawah 768px. Sidebar berubah jadi bar horizontal di atas yang bisa di-scroll ke samping; tidak ada drawer dan tidak ada tombol hamburger.
6. Klik **← Toko** → kembali ke storefront. Klik **Keluar** → terlogout dan diarahkan ke `/`.
7. Buka `/admin` dalam keadaan **tidak login** → terlempar ke `/login?next=/admin`. Login sebagai `customer@demo.id` (role customer) → terlempar ke `/`.
8. DevTools console → pastikan tidak ada error atau warning React.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/admin-shell.tsx app/admin/layout.tsx
git commit -m "feat: replace admin sidebar with responsive shell and breadcrumb"
```

---

### Task 10: Domain analytics

**Files:**
- Create: `src/server/domain/admin-analytics.ts`
- Test: `tests/unit/bucket-daily.test.ts`
- Test: `tests/integration/admin-analytics.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `type Session` (session.ts); `LOW_STOCK_THRESHOLD` (Task 1); `listOrdersForAdmin({ take })`, `type OrderSummary` (Task 5).
- Produces:
  ```ts
  export type Period = 7 | 30 | 90;
  export type Metric = { value: number; previous: number };
  export type BucketInput = { createdAt: Date; total: number; status: OrderStatus };
  export type DashboardMetrics = {
    period: Period;
    revenue: Metric;
    paidOrders: Metric;
    newUsers: Metric;
    aov: number;
    dailyRevenue: { date: string; total: number }[];
    statusCounts: { status: OrderStatus; count: number }[];
    topProducts: { productName: string; qty: number }[];
    lowStock: { productName: string; variantLabel: string; stock: number }[];
    recentOrders: OrderSummary[];
  };
  export function parsePeriod(raw: string | undefined): Period;
  export function bucketDaily(orders: BucketInput[], from: Date, to: Date): { date: string; total: number }[];
  export function getDashboardMetrics(actor: Session | null, period?: Period): Promise<DashboardMetrics | { error: string }>;
  ```

**Konvensi tanggal.** `bucketDaily` dan jendela periode memakai **waktu lokal server** (`getFullYear`/`getMonth`/`getDate`), bukan UTC, supaya batas hari sesuai dengan yang dilihat admin di WIB. Test membuat tanggal pada pukul 12.00 lokal agar tidak sensitif terhadap batas tengah malam.

**Definisi jendela.** `currentFrom` = tengah malam `period - 1` hari yang lalu; `previousFrom` = tengah malam `period * 2 - 1` hari yang lalu; `to` = sekarang. Dengan offset `period - 1`, jendela saat ini mencakup **tepat `period` hari kalender termasuk hari ini**, dan `dailyRevenue` menghasilkan tepat `period` bucket. Memakai `period` polos akan menghasilkan `period + 1` bucket karena hari ini ikut terhitung sebagai bucket tersendiri. Jendela sebelumnya persis `period` hari, dari tengah malam ke tengah malam. Test memakai offset 1 hari (jendela kini) dan 10 hari (jendela sebelumnya) dengan `period = 7`.

- [ ] **Step 1: Tulis unit test `bucketDaily` yang gagal**

Buat `tests/unit/bucket-daily.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bucketDaily, parsePeriod } from "@/server/domain/admin-analytics";

function daysAgo(n: number, hour = 12): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  d.setHours(hour);
  return d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("parsePeriod", () => {
  it("menerima 7, 30, dan 90", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod("30")).toBe(30);
    expect(parsePeriod("90")).toBe(90);
  });

  it("jatuh ke 30 untuk input lain", () => {
    expect(parsePeriod(undefined)).toBe(30);
    expect(parsePeriod("")).toBe(30);
    expect(parsePeriod("14")).toBe(30);
    expect(parsePeriod("abc")).toBe(30);
  });
});

describe("bucketDaily", () => {
  it("menghasilkan satu entri per hari dalam rentang, termasuk hari kosong", () => {
    const result = bucketDaily([], daysAgo(2, 0), daysAgo(0, 0));
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.date)).toEqual([dayKey(daysAgo(2)), dayKey(daysAgo(1))]);
    expect(result.every((r) => r.total === 0)).toBe(true);
  });

  it("menjumlahkan beberapa pesanan pada hari yang sama", () => {
    const result = bucketDaily(
      [
        { createdAt: daysAgo(1, 9), total: 100000, status: "PAID" },
        { createdAt: daysAgo(1, 18), total: 50000, status: "DELIVERED" },
      ],
      daysAgo(2, 0),
      daysAgo(0, 0),
    );
    expect(result.find((r) => r.date === dayKey(daysAgo(1)))?.total).toBe(150000);
  });

  it("mengabaikan pesanan di luar rentang", () => {
    const result = bucketDaily(
      [
        { createdAt: daysAgo(5), total: 999000, status: "PAID" },
        { createdAt: daysAgo(1), total: 1000, status: "PAID" },
      ],
      daysAgo(2, 0),
      daysAgo(0, 0),
    );
    expect(result.reduce((s, r) => s + r.total, 0)).toBe(1000);
  });

  it("mengabaikan pesanan PENDING dan CANCELLED", () => {
    const result = bucketDaily(
      [
        { createdAt: daysAgo(1, 10), total: 500, status: "PENDING" },
        { createdAt: daysAgo(1, 11), total: 700, status: "CANCELLED" },
        { createdAt: daysAgo(1, 12), total: 300, status: "PAID" },
      ],
      daysAgo(2, 0),
      daysAgo(0, 0),
    );
    expect(result.find((r) => r.date === dayKey(daysAgo(1)))?.total).toBe(300);
  });
});
```

`daysAgo(2, 0)` adalah tengah malam dua hari lalu, jadi rentang `[daysAgo(2,0), daysAgo(0,0))` memuat tepat dua hari kalender: dua hari lalu dan kemarin. Hari ini tidak termasuk karena `to` eksklusif.

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `npx vitest run tests/unit/bucket-daily.test.ts`
Expected: FAIL — modul `@/server/domain/admin-analytics` belum ada.

- [ ] **Step 3: Implementasi `admin-analytics.ts`**

Buat `src/server/domain/admin-analytics.ts`:

```ts
import type { OrderStatus } from "@prisma/client";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { prisma } from "@/server/db";
import { listOrdersForAdmin, type OrderSummary } from "@/server/domain/orders";
import { assertRole, type Session } from "@/server/session";

export type Period = 7 | 30 | 90;
export type Metric = { value: number; previous: number };
export type BucketInput = { createdAt: Date; total: number; status: OrderStatus };

export type DashboardMetrics = {
  period: Period;
  revenue: Metric;
  paidOrders: Metric;
  newUsers: Metric;
  aov: number;
  dailyRevenue: { date: string; total: number }[];
  statusCounts: { status: OrderStatus; count: number }[];
  topProducts: { productName: string; qty: number }[];
  lowStock: { productName: string; variantLabel: string; stock: number }[];
  recentOrders: OrderSummary[];
};

const EXCLUDED: OrderStatus[] = ["PENDING", "CANCELLED"];

export function parsePeriod(raw: string | undefined): Period {
  const n = Number.parseInt(raw ?? "", 10);
  return n === 7 || n === 30 || n === 90 ? n : 30;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDayDaysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export function bucketDaily(
  orders: BucketInput[],
  from: Date,
  to: Date,
): { date: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const o of orders) {
    if (o.createdAt < from || o.createdAt >= to) continue;
    if (EXCLUDED.includes(o.status)) continue;
    const key = dayKey(o.createdAt);
    totals.set(key, (totals.get(key) ?? 0) + o.total);
  }
  const out: { date: string; total: number }[] = [];
  const cursor = new Date(from);
  while (cursor < to) {
    const key = dayKey(cursor);
    out.push({ date: key, total: totals.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export async function getDashboardMetrics(
  actor: Session | null,
  period: Period = 30,
): Promise<DashboardMetrics | { error: string }> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }

  const to = new Date();
  // period - 1 supaya jendela mencakup tepat `period` hari kalender TERMASUK hari ini.
  // Mulai dari tengah malam `period` hari lalu akan menghasilkan period + 1 bucket.
  const currentFrom = startOfDayDaysAgo(to, period - 1);
  const previousFrom = startOfDayDaysAgo(to, period * 2 - 1);

  const [orders, statusGroups, topGroups, lowStock, newUsersCurrent, newUsersPrevious, recent] =
    await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: previousFrom, lt: to } },
        select: { createdAt: true, total: true, status: true },
      }),
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.orderItem.groupBy({
        by: ["productName"],
        where: { order: { status: { notIn: EXCLUDED } } },
        _sum: { qty: true },
        orderBy: { _sum: { qty: "desc" } },
        take: 5,
      }),
      prisma.productVariant.findMany({
        where: { stock: { lte: LOW_STOCK_THRESHOLD }, product: { isActive: true } },
        include: { product: { select: { name: true } } },
        orderBy: { stock: "asc" },
        take: 8,
      }),
      prisma.user.count({ where: { createdAt: { gte: currentFrom, lt: to } } }),
      prisma.user.count({ where: { createdAt: { gte: previousFrom, lt: currentFrom } } }),
      listOrdersForAdmin({ take: 6 }),
    ]);

  const paid = orders.filter((o) => !EXCLUDED.includes(o.status));
  const inWindow = (list: typeof paid, from: Date, limit: Date) =>
    list.filter((o) => o.createdAt >= from && o.createdAt < limit);
  const sumOf = (list: typeof paid) => list.reduce((s, o) => s + o.total, 0);

  const paidCurrent = inWindow(paid, currentFrom, to);
  const paidPrevious = inWindow(paid, previousFrom, currentFrom);
  const revenueValue = sumOf(paidCurrent);

  return {
    period,
    revenue: { value: revenueValue, previous: sumOf(paidPrevious) },
    paidOrders: { value: paidCurrent.length, previous: paidPrevious.length },
    newUsers: { value: newUsersCurrent, previous: newUsersPrevious },
    aov: paidCurrent.length === 0 ? 0 : Math.round(revenueValue / paidCurrent.length),
    dailyRevenue: bucketDaily(orders, currentFrom, to),
    statusCounts: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    topProducts: topGroups.map((g) => ({ productName: g.productName, qty: g._sum.qty ?? 0 })),
    lowStock: lowStock.map((v) => ({
      productName: v.product.name,
      variantLabel: `${v.colorName} / ${v.size}`,
      stock: v.stock,
    })),
    recentOrders: recent.rows,
  };
}
```

Tujuh query berjalan paralel dalam satu `Promise.all`. `groupBy` pada `orderItem` memakai filter relasi `order.status` supaya pesanan batal tidak menggelembungkan top produk.

**Batas yang diketahui (spec §6):** `prisma.order.findMany` mengambil baris mentah lalu mem-bucket di JS. Ini mulai berat di atas sekitar 10 ribu pesanan dalam satu jendela. Titik penggantinya adalah agregasi `date_trunc('day', "createdAt")` via `prisma.$queryRaw`; karena seluruh logika bucketing terisolasi di `bucketDaily`, penggantian itu tidak menyentuh pemanggil mana pun.

- [ ] **Step 4: Jalankan unit test dan pastikan lulus**

Run: `npx vitest run tests/unit/bucket-daily.test.ts`
Expected: PASS semua (6 test).

- [ ] **Step 5: Tulis test integrasi**

Buat `tests/integration/admin-analytics.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getDashboardMetrics, type DashboardMetrics } from "@/server/domain/admin-analytics";
import { addToCart } from "@/server/domain/cart";
import { createOrderFromCart, transitionOrder } from "@/server/domain/orders";
import type { Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

const ADDRESS = {
  recipient: "Penerima Uji",
  phone: "08123456789",
  line1: "Jl. Uji No. 1",
  city: "Jakarta",
  province: "DKI Jakarta",
  postalCode: "10110",
};

let admin: Session;

beforeEach(async () => {
  await cleanDb();
  const user = await makeUser("ADMIN");
  admin = { userId: user.id, role: "ADMIN" };
});

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

async function placeOrder(daysBack: number, status: "PAID" | "CANCELLED" | "PENDING") {
  const buyer = await makeUser();
  const cat = await makeCategory();
  const product = await makeProduct(cat.id, { stock: 20, basePrice: 100000 });
  await addToCart(buyer.id, product.variants[0].id, 1);
  const created = (await createOrderFromCart(buyer.id, ADDRESS)) as { ok: true; orderCode: string };
  const order = await prisma.order.findUniqueOrThrow({ where: { code: created.orderCode } });
  if (status !== "PENDING") await transitionOrder(order.id, status);
  // createOrderFromCart memakai @default(now()), jadi createdAt ditimpa setelahnya
  await prisma.order.update({ where: { id: order.id }, data: { createdAt: daysAgo(daysBack) } });
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

async function metrics(period: 7 | 30 | 90 = 7): Promise<DashboardMetrics> {
  const result = await getDashboardMetrics(admin, period);
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("getDashboardMetrics", () => {
  it("menolak aktor non-admin", async () => {
    const customer = await makeUser();
    const actor: Session = { userId: customer.id, role: "CUSTOMER" };
    await expect(getDashboardMetrics(actor)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("mengembalikan nol di semua metrik untuk DB kosong tanpa crash", async () => {
    const m = await metrics(7);
    expect(m.revenue).toEqual({ value: 0, previous: 0 });
    expect(m.paidOrders).toEqual({ value: 0, previous: 0 });
    // beforeEach membuat satu admin dengan createdAt = now(), jadi ia terhitung sebagai user baru
    expect(m.newUsers).toEqual({ value: 1, previous: 0 });
    expect(m.aov).toBe(0);
    expect(m.statusCounts).toEqual([]);
    expect(m.topProducts).toEqual([]);
    expect(m.lowStock).toEqual([]);
    expect(m.recentOrders).toEqual([]);
    expect(m.dailyRevenue).toHaveLength(7);
    expect(m.dailyRevenue.every((d) => d.total === 0)).toBe(true);
  });

  it("menghitung revenue hanya dari pesanan yang dibayar", async () => {
    const paid = await placeOrder(1, "PAID");
    await placeOrder(1, "CANCELLED");
    await placeOrder(1, "PENDING");
    const m = await metrics(7);
    expect(m.revenue.value).toBe(paid.total);
    expect(m.paidOrders.value).toBe(1);
    expect(m.aov).toBe(paid.total);
  });

  it("memisahkan periode saat ini dan periode sebelumnya", async () => {
    const now = await placeOrder(1, "PAID");
    const before = await placeOrder(10, "PAID");
    const m = await metrics(7);
    expect(m.revenue.value).toBe(now.total);
    expect(m.revenue.previous).toBe(before.total);
    expect(m.paidOrders.value).toBe(1);
    expect(m.paidOrders.previous).toBe(1);
  });

  it("menghasilkan satu bucket per hari untuk periode yang diminta", async () => {
    await placeOrder(2, "PAID");
    const m = await metrics(30);
    expect(m.dailyRevenue).toHaveLength(30);
    expect(m.dailyRevenue.filter((d) => d.total > 0)).toHaveLength(1);
  });

  it("menghitung distribusi status seluruh waktu", async () => {
    await placeOrder(1, "PAID");
    await placeOrder(2, "CANCELLED");
    const m = await metrics(7);
    const byStatus = Object.fromEntries(m.statusCounts.map((s) => [s.status, s.count]));
    expect(byStatus.PAID).toBe(1);
    expect(byStatus.CANCELLED).toBe(1);
  });

  it("mengecualikan pesanan batal dari top produk", async () => {
    await placeOrder(1, "CANCELLED");
    const m = await metrics(7);
    expect(m.topProducts).toEqual([]);
  });

  it("menyertakan produk terlaris dari pesanan yang dibayar", async () => {
    await placeOrder(1, "PAID");
    const m = await metrics(7);
    expect(m.topProducts).toHaveLength(1);
    expect(m.topProducts[0].qty).toBe(1);
  });

  it("menandai stok menipis hanya untuk produk aktif", async () => {
    const cat = await makeCategory();
    await makeProduct(cat.id, { stock: 2, isActive: true });
    await makeProduct(cat.id, { stock: 1, isActive: false });
    await makeProduct(cat.id, { stock: 40, isActive: true });
    const m = await metrics(7);
    expect(m.lowStock).toHaveLength(1);
    expect(m.lowStock[0].stock).toBe(2);
    expect(m.lowStock[0].variantLabel).toBe("Hitam / M");
  });

  it("membatasi recentOrders ke enam baris", async () => {
    for (let i = 0; i < 8; i++) await placeOrder(1, "PAID");
    const m = await metrics(7);
    expect(m.recentOrders).toHaveLength(6);
  });

  it("menghitung user baru per periode relatif terhadap baseline", async () => {
    // beforeEach sudah membuat satu admin hari ini; ambil baseline supaya test tidak bergantung padanya
    const baseline = (await metrics(7)).newUsers.value;
    await prisma.user.create({
      data: { email: "baru@test.id", name: "Baru", passwordHash: "x:y", createdAt: daysAgo(1) },
    });
    await prisma.user.create({
      data: { email: "lama@test.id", name: "Lama", passwordHash: "x:y", createdAt: daysAgo(10) },
    });
    const m = await metrics(7);
    expect(m.newUsers.value).toBe(baseline + 1);
    expect(m.newUsers.previous).toBe(1);
  });
});
```

`makeProduct` default membuat satu warna ("Hitam") dan satu ukuran ("M"), jadi `variantLabel` yang diharapkan adalah `"Hitam / M"`. Test "menandai stok menipis" membuat produk dengan `stock: 2` — di bawah `LOW_STOCK_THRESHOLD` (5) — dan dua produk pembanding yang seharusnya tersaring (nonaktif, dan stok 40).

Test user baru memakai baseline karena `beforeEach` membuat satu admin dengan `createdAt = now()`, dan setiap `placeOrder` juga membuat user pembeli. Menulis angka literal akan membuat test pecah setiap kali helper di atas berubah.

- [ ] **Step 6: Jalankan test integrasi**

Run: `npx vitest run tests/integration/admin-analytics.test.ts`
Expected: PASS semua (11 test).

- [ ] **Step 7: Test penuh**

Run: `npx vitest run`
Expected: seluruh suite hijau, termasuk `admin-catalog`, `orders`, `cart`, `catalog`, `admin-users`, dan semua unit test lama.

- [ ] **Step 8: Commit**

```bash
git add src/server/domain/admin-analytics.ts tests/unit/bucket-daily.test.ts tests/integration/admin-analytics.test.ts
git commit -m "feat: add admin dashboard analytics domain"
```

---

### Task 11: Dashboard page + charts

**Files:**
- Modify: `package.json`, `package-lock.json` (tambah `recharts`)
- Modify: `src/lib/order-status.ts` (tambah `ORDER_STATUS_LABELS`)
- Modify: `src/components/storefront/status-chip.tsx` (pakai label bersama)
- Create: `src/components/admin/chart-palette.ts`
- Create: `src/components/admin/kpi-card.tsx`
- Create: `src/components/admin/revenue-chart.tsx`
- Create: `src/components/admin/status-donut.tsx`
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `getDashboardMetrics`, `parsePeriod`, `DashboardMetrics`, `Period` (Task 10); `formatIDR` dari `src/lib/format.ts`; `StatusChip` dari `src/components/storefront/status-chip.tsx`.
- Produces: rute `/admin` sebagai dashboard; `ORDER_STATUS_LABELS: Record<OrderStatus, string>` diekspor dari `src/lib/order-status.ts`.

- [ ] **Step 1: Pasang recharts**

Run: `npm i recharts`
Expected: `recharts@^3.10.1` masuk ke `dependencies` di `package.json`. **Tidak ada dependensi lain yang boleh ditambahkan di task ini.**

- [ ] **Step 2: Pindahkan label status ke `order-status.ts`**

Tambahkan ke `src/lib/order-status.ts`, tepat setelah blok `VALID_TRANSITIONS`:

```ts
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Menunggu Pembayaran",
  PAID: "Dibayar",
  PROCESSING: "Diproses",
  SHIPPED: "Dikirim",
  DELIVERED: "Selesai",
  CANCELLED: "Dibatalkan",
};
```

Di `src/components/storefront/status-chip.tsx`, hapus blok `const LABELS` lokal (baris 3-10) dan ganti import serta pemakaiannya:

```tsx
import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

const TONES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  PAID: "bg-lime text-olive",
  PROCESSING: "bg-sky-100 text-sky-900",
  SHIPPED: "bg-violet-100 text-violet-900",
  DELIVERED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-red-100 text-red-900",
};

export function StatusChip({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
```

`TONES` tetap di `status-chip.tsx` karena itu concerns Tailwind, bukan domain. `chart-palette.ts` di Step 3 menyimpan padanan hex-nya.

- [ ] **Step 3: Buat palet chart**

Buat `src/components/admin/chart-palette.ts`:

```ts
import type { OrderStatus } from "@prisma/client";

export const CHART = {
  lime: "#c8f169",
  olive: "#2f3b22",
  sage: "#a9c3a2",
  cream: "#f4f6ec",
  grid: "rgba(47, 59, 34, 0.12)",
} as const;

export const STATUS_HEX: Record<OrderStatus, string> = {
  PENDING: "#f59e0b",
  PAID: "#c8f169",
  PROCESSING: "#0ea5e9",
  SHIPPED: "#8b5cf6",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
};
```

`STATUS_HEX` adalah padanan hex dari kelas Tailwind di `TONES` (`amber-500`, `lime` brand, `sky-500`, `violet-500`, `emerald-500`, `red-500`). recharts meneruskan warna ke atribut presentasi SVG, dan `var(--color-lime)` di sana tidak andal — karena itu hex ditulis eksplisit. Konsekuensinya: **bila token di `app/globals.css` atau `TONES` berubah, file ini harus diselaraskan manual.**

- [ ] **Step 4: Buat `KpiCard`**

Buat `src/components/admin/kpi-card.tsx`:

```tsx
import { formatIDR } from "@/lib/format";

type Props = {
  label: string;
  value: number;
  previous?: number;
  format: "idr" | "count";
};

function render(value: number, format: "idr" | "count") {
  return format === "idr" ? formatIDR(value) : value.toLocaleString("id-ID");
}

export function KpiCard({ label, value, previous, format }: Props) {
  const showDelta = previous !== undefined && previous > 0;
  const delta = showDelta ? Math.round(((value - previous!) / previous!) * 100) : null;

  return (
    <div className="rounded-2xl bg-card p-4">
      <p className="text-xs uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">
        {format === "idr" && value === 0 ? "—" : render(value, format)}
      </p>
      {delta === null ? (
        <p className="mt-1 text-xs opacity-40">tidak ada pembanding</p>
      ) : (
        <p className={`mt-1 text-xs font-semibold ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs periode lalu
        </p>
      )}
    </div>
  );
}
```

Server component murni — tidak ada state, tidak ada event handler. AOV memakai `format="idr"` dan `previous` tidak diteruskan sehingga delta tidak dirender.

- [ ] **Step 5: Buat `RevenueChart`**

Buat `src/components/admin/revenue-chart.tsx`:

```tsx
"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "./chart-palette";

type Point = { date: string; total: number };

export function RevenueChart({ data }: { data: Point[] }) {
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return <p className="py-16 text-center text-sm opacity-50">Belum ada data.</p>;
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.lime} stopOpacity={0.75} />
              <stop offset="100%" stopColor={CHART.lime} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: CHART.olive }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={24}
            stroke={CHART.grid}
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART.olive }}
            width={70}
            stroke={CHART.grid}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))}
          />
          <Tooltip
            formatter={(value) => [`Rp ${Number(value).toLocaleString("id-ID")}`, "Revenue"]}
            contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke={CHART.olive}
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 6: Buat `StatusDonut`**

Buat `src/components/admin/status-donut.tsx`:

```tsx
"use client";

import type { OrderStatus } from "@prisma/client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { CHART, STATUS_HEX } from "./chart-palette";

type Slice = { status: OrderStatus; count: number };

export function StatusDonut({ data }: { data: Slice[] }) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm opacity-50">Belum ada data.</p>;
  }
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" innerRadius="58%" outerRadius="88%" paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.status} fill={STATUS_HEX[d.status]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${Number(value)} pesanan`, ORDER_STATUS_LABELS[name as OrderStatus]]}
              contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold">{total}</span>
          <span className="text-xs uppercase tracking-widest opacity-60">total</span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[d.status] }} />
            <span className="opacity-70">{ORDER_STATUS_LABELS[d.status]}</span>
            <span className="font-bold">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Tulis ulang halaman dashboard**

Ganti seluruh isi `app/admin/page.tsx` (saat ini hanya `redirect("/admin/produk")`):

```tsx
import Link from "next/link";
import type { Period } from "@/server/domain/admin-analytics";
import { KpiCard } from "@/components/admin/kpi-card";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { StatusDonut } from "@/components/admin/status-donut";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { getDashboardMetrics, parsePeriod } from "@/server/domain/admin-analytics";
import { requireAdmin } from "@/server/session";

const PERIODS: Period[] = [7, 30, 90];

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-olive/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest opacity-60">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm opacity-50">{text}</p>;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const { periode } = await searchParams;
  const session = await requireAdmin();
  const period = parsePeriod(periode);
  const result = await getDashboardMetrics(session, period);
  if ("error" in result) return <p className="text-sm">{result.error}</p>;
  const m = result;
  const maxQty = Math.max(1, ...m.topProducts.map((p) => p.qty));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Dashboard</h1>
        <nav className="flex gap-2 text-xs font-semibold uppercase tracking-widest">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={p === 30 ? "/admin" : `/admin?periode=${p}`}
              className={`rounded-full px-3 py-1 ${period === p ? "bg-olive text-lime" : "border border-olive/20"}`}
            >
              {p} hari
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={`Revenue ${period} hari`} value={m.revenue.value} previous={m.revenue.previous} format="idr" />
        <KpiCard label="Pesanan dibayar" value={m.paidOrders.value} previous={m.paidOrders.previous} format="count" />
        <KpiCard label="Rata-rata pesanan" value={m.aov} format="idr" />
        <KpiCard label="User baru" value={m.newUsers.value} previous={m.newUsers.previous} format="count" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel title={`Revenue harian · ${period} hari`}>
          <RevenueChart data={m.dailyRevenue} />
        </Panel>
        <Panel title="Status pesanan · seluruh waktu">
          <StatusDonut data={m.statusCounts} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Produk terlaris">
          {m.topProducts.length === 0 ? (
            <Empty text="Belum ada penjualan." />
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {m.topProducts.map((p) => (
                <li key={p.productName}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{p.productName}</span>
                    <span className="opacity-60">{p.qty} terjual</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-cream">
                    <div
                      className="h-2 rounded-full bg-lime"
                      style={{ width: `${Math.round((p.qty / maxQty) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={`Stok menipis · ≤ ${LOW_STOCK_THRESHOLD}`}
          action={
            <Link href="/admin/produk" className="text-xs font-semibold uppercase tracking-widest underline">
              Kelola
            </Link>
          }
        >
          {m.lowStock.length === 0 ? (
            <Empty text="Semua stok aman." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {m.lowStock.map((v, i) => (
                <li key={i} className="flex items-center justify-between border-b border-olive/10 pb-2">
                  <span>
                    <span className="font-semibold">{v.productName}</span>
                    <span className="ml-2 text-xs opacity-60">{v.variantLabel}</span>
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${v.stock === 0 ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
                    {v.stock === 0 ? "Habis" : `Sisa ${v.stock}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Pesanan terbaru"
        action={
          <Link href="/admin/pesanan" className="text-xs font-semibold uppercase tracking-widest underline">
            Semua
          </Link>
        }
      >
        {m.recentOrders.length === 0 ? (
          <Empty text="Belum ada pesanan." />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {m.recentOrders.map((o) => (
                <tr key={o.code} className="border-b border-olive/10">
                  <td className="py-2">
                    <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">
                      {o.code}
                    </Link>
                  </td>
                  <td className="opacity-80">{o.customerName}</td>
                  <td className="opacity-60">{new Date(o.createdAt).toLocaleDateString("id-ID")}</td>
                  <td>{formatIDR(o.total)}</td>
                  <td><StatusChip status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
```

Bar "Produk terlaris" memakai `div` dengan lebar persentase — **bukan** recharts. Untuk lima bar statis tidak ada gunanya menambah client component ketiga.

- [ ] **Step 8: Typecheck, test penuh, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: semuanya bersih. `npm run build` khusus penting di task ini karena recharts adalah dependensi baru dan Next perlu mem-bundle-nya sebagai client component.

- [ ] **Step 9: Verifikasi manual di browser**

Run: `npm run db:seed` bila belum, lalu `npm run dev`, login sebagai `admin@demo.id` / `admin1234`.

1. Buka `/admin`. Empat kartu KPI terisi angka, bukan `—` semua (seed punya pesanan? bila belum ada pesanan, revenue dan AOV menampilkan `—` dan itu benar — buat satu pesanan lewat storefront sebagai `customer@demo.id` lalu bayar di mock gateway untuk melihat angka terisi).
2. Klik **7 hari** → URL jadi `?periode=7`, chart menyempit jadi 7 titik. Klik **90 hari** → 90 titik. Klik **30 hari** → kembali ke `/admin` tanpa query.
3. Chart revenue merender area lime dengan tooltip saat hover. Sumbu Y menampilkan format `...rb`.
4. Donut status merender dengan lubang tengah berisi angka total, plus legend berwarna di bawahnya. Warna legend cocok dengan `StatusChip` di tabel pesanan terbaru.
5. Panel **Produk terlaris** menampilkan bar dengan lebar proporsional.
6. Panel **Stok menipis** menampilkan varian dengan stok ≤ 5; badge merah "Habis" untuk stok 0, amber untuk sisa.
7. **Uji empty state:** pada DB yang benar-benar kosong (atau sebelum ada pesanan), semua panel menampilkan "Belum ada data." / "Belum ada pesanan." — bukan sumbu kosong.
8. Persempit ke lebar ponsel → kartu KPI jadi satu kolom, panel menumpuk, tidak ada overflow horizontal.
9. DevTools console → tidak ada error atau warning React. Pastikan juga tidak ada hydration mismatch dari recharts.
10. Buka `/admin/pesanan` dan `/admin/produk` → pastikan `StatusChip` masih menampilkan label yang benar setelah `LABELS` dipindah ke `order-status.ts` di Step 2.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/lib/order-status.ts src/components/storefront/status-chip.tsx src/components/admin/chart-palette.ts src/components/admin/kpi-card.tsx src/components/admin/revenue-chart.tsx src/components/admin/status-donut.tsx app/admin/page.tsx
git commit -m "feat: add admin dashboard with KPI cards and recharts panels"
```

---

### Task 12: Verifikasi akhir dan rekonsiliasi spec lama

Menutup seluruh plan: memastikan tidak ada regresi, dan spec lama tidak lagi mengklaim dashboard admin sebagai out-of-scope.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-ecommerce-design.md` (bagian Out-of-scope)
- Modify: `docs/superpowers/specs/2026-09-28-admin-console-design.md` (catat deviasi implementasi, bila ada)

**Interfaces:**
- Consumes: seluruh task sebelumnya.
- Produces: tidak ada kode baru.

- [ ] **Step 1: Suite test penuh dari kondisi bersih**

Run: `npm run db:up && npx vitest run`
Expected: seluruh suite hijau. Catat jumlah test dan pastikan tidak ada yang ter-skip tanpa alasan.

- [ ] **Step 2: Typecheck dan production build**

Run: `npx tsc --noEmit && npm run build`
Expected: bersih. Perhatikan output build: seluruh halaman `/admin/*` harus bertanda `ƒ (Dynamic)` karena `requireAdmin()` membaca cookie. Bila ada yang `○ (Static)`, itu bug — berarti guard tidak terpanggil di halaman tersebut.

- [ ] **Step 3: Lint manual terhadap Global Constraints**

Periksa satu per satu dengan `grep`:

```bash
grep -rn "app/globals.css" --include=*.tsx src app          # tidak boleh ada perubahan token
git diff --stat main -- app/globals.css                     # harus kosong
grep -rn "recharts" package.json                            # satu-satunya dependensi baru
git diff --stat main -- package.json                        # hanya recharts yang bertambah
grep -rn "\$queryRaw" src                                   # harus kosong — tidak ada raw SQL
```

Expected: `app/globals.css` tidak berubah; `package.json` hanya bertambah `recharts`; tidak ada `$queryRaw`.

- [ ] **Step 4: Walkthrough end-to-end di browser**

Run: `npm run dev`. Jalankan sebagai dua persona.

**Sebagai admin** (`admin@demo.id` / `admin1234`):
1. `/admin` → dashboard lengkap, ganti periode 7/30/90.
2. Sidebar → keempat item menavigasi dan active state benar di tiap halaman, termasuk halaman bersarang (`/admin/pesanan/<kode>`, `/admin/produk/baru`).
3. `/admin/pesanan` → filter tab + pencarian + detail + transisi status sampai `SHIPPED` (resi muncul).
4. `/admin/produk` → pencarian, toggle aktif, edit satu produk dan ubah stok jadi 0 → kembali ke `/admin` dan pastikan produk itu muncul di panel **Stok menipis** dengan badge "Habis".
5. `/admin/pengguna` → cari, filter role, filter status, promote, demote, suspend, activate, reset password.
6. `/admin/pengguna/<id>` → detail lengkap dengan alamat dan riwayat pesanan.

**Sebagai customer** (`customer@demo.id` / `customer1234`):
7. Belanja normal: tambah ke keranjang → checkout → bayar di mock gateway → lihat timeline di `/akun/pesanan/<kode>`. Pastikan tidak ada regresi dari perubahan `listOrdersForAdmin` dan `requireUser`.
8. Setelah di-suspend oleh admin: buka `/cart` → terlempar ke `/login`. Coba login → `Akun ditangguhkan.`
9. Setelah di-activate kembali: login berhasil, keranjang dan riwayat pesanan masih utuh.

**Sebagai anonim:**
10. Buka `/admin` tanpa login → `/login?next=/admin`.
11. Buka storefront → tidak ada perubahan tampilan dan tidak ada query DB tambahan yang terlihat di log Next.

- [ ] **Step 5: Rekonsiliasi spec lama**

Di `docs/superpowers/specs/2026-09-28-ecommerce-design.md`, pada bagian `### Out-of-scope (eksplisit)`, ganti bullet yang menyebut dashboard analitik admin menjadi:

```markdown
- Integrasi payment gateway / kurir nyata.
- Kupon/diskon, wishlist fungsional, review produk, manajemen kategori via admin (kategori hanya dari seed).
- ~~Dashboard analitik admin~~ — **dicabut 2026-09-28**, lihat `2026-09-28-admin-console-design.md`.
- Cancel pesanan oleh customer (cancel hanya dari admin).
- Guest checkout (checkout wajib login).
- Deploy/production hosting (demo lokal-first; kode tidak menghalangi deploy nanti).
```

Jangan mengubah bagian lain spec lama — dokumen itu tetap menjadi catatan akurat untuk scope storefront.

- [ ] **Step 6: Catat deviasi implementasi di spec baru**

Bila selama eksekusi ada deviasi dari `2026-09-28-admin-console-design.md` (selain dua yang sudah tercatat di plan ini: penyempurnaan signature `evaluateAccess` di Task 2, `SearchForm` menjadi client component di Task 4, dan penghapusan `toggle-active-button.tsx` di Task 3), tambahkan bagian `## 12. Deviasi implementasi` di akhir spec baru dan tuliskan apa yang berubah serta alasannya. Bila tidak ada deviasi tambahan, lewati langkah ini.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-28-ecommerce-design.md docs/superpowers/specs/2026-09-28-admin-console-design.md
git commit -m "docs: reconcile e-commerce spec with shipped admin console"
```

- [ ] **Step 8: Tinjau seluruh rangkaian commit**

Run: `git log --oneline main..HEAD`
Expected: 12 commit, satu per task, masing-masing dengan pesan yang menjelaskan *mengapa*. Tidak ada commit yang mencampur dua task.

---

## Catatan untuk eksekutor

Tiga deviasi dari spec sudah disengaja dan terdokumentasi di task masing-masing — jangan "memperbaikinya" kembali ke spec tanpa membaca alasannya:

1. **Task 2** — `evaluateAccess(user, required?: Role)` memakai parameter opsional, bukan `required: Role` seperti di spec §8, karena `requireUser()` tidak punya nilai `Role` untuk diteruskan.
2. **Task 4** — `SearchForm` adalah client component, bukan GET form server murni seperti di spec §5, karena GET form HTML membuang query param lain (filter status) saat submit.
3. **Task 3** — `toggle-active-button.tsx` dihapus, bukan dibungkus, karena `ActionButton` menggantikannya sepenuhnya.

Urutan task sengaja disusun supaya tidak ada keadaan setengah jadi yang terlihat pengguna: shell (Task 9) dipasang setelah `/admin/pengguna` (Task 8) ada, sehingga tidak ada tautan navigasi yang 404 di tengah jalan.
