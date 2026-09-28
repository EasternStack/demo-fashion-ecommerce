# E-Commerce End-to-End Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun demo e-commerce end-to-end (storefront, akun, mock payment, mock delivery, admin produk/stok/order) dengan Next.js 15 + Prisma + PostgreSQL sesuai spec.

**Architecture:** Monolith Next.js App Router; halaman = React Server Components yang membaca via modul domain di `src/server/domain/*`; semua mutasi = Server Actions tipis. Payment gateway dan courier tiruan berada di belakang interface `PaymentProvider`/`ShippingProvider`. Stok per varian (warna × ukuran) dikurangi/direstore dalam transaksi Prisma.

**Tech Stack:** Next.js 15 (App Router, TS), React 19, Prisma 6 + PostgreSQL 16 (docker-compose), Tailwind CSS v4, jose (JWT session), scrypt (node:crypto), Vitest 3, tsx.

**Spec:** `docs/superpowers/specs/2026-09-28-ecommerce-design.md`

## Global Constraints

- Copy UI seluruhnya **bahasa Indonesia**; harga disimpan `Int` rupiah penuh dan ditampilkan via `Intl.NumberFormat("id-ID")` → `Rp89.900`.
- Enum status pesanan: `PENDING, PAID, PROCESSING, SHIPPED, DELIVERED, CANCELLED`; transisi hanya lewat peta di `src/lib/order-status.ts` (satu-satunya sumber kebenaran).
- Format order code: `ESV-YYYYMMDD-XXXX` dengan XXXX = 4 karakter alfanumerik acak.
- Cookie session: nama `esv_session`, JWT HS256 via `jose`, expiry 7 hari, secret dari env `SESSION_SECRET`.
- Ongkir flat dummy: `SHIPPING_FLAT_COST = 15000`.
- Mock payment "MockPay": nomor kartu berakhiran `0002` → declined; selain itu sukses; delay "memproses" ±2 detik di sisi client.
- Upload gambar admin → `var/uploads/`, disajikan via Route Handler `/uploads/[...path]`; JANGAN menulis ke `public/` saat runtime.
- Postgres docker: port `5432` db `ecommerce`, port `5433` db `ecommerce_test`; env `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`.
- Kredensial seed: `admin@demo.id / admin1234`, `customer@demo.id / customer1234`; 5 kategori; 12 produk.
- Test: Vitest; test integration memakai `TEST_DATABASE_URL` dengan cleanup tabel per test.
- Stok dikurangi saat `createOrder` (satu transaksi, conditional update `stock >= qty`); cancel merestore stok dalam transaksi.
- Guard admin ganda: `app/admin/layout.tsx` DAN setiap Server Action admin memanggil check role.
- Cancel pesanan hanya dari admin; checkout wajib login; tidak ada guest checkout.
- Path alias TypeScript: `@/*` → `./src/*`.

## File Structure

```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs, .gitignore, .env.example, .env (local, gitignored)
docker-compose.yml                  # postgres (5432) + postgres-test (5433)
prisma/schema.prisma                # seluruh model & enum
prisma/seed.ts                      # akun demo, kategori, 12 produk + varian + stok
app/layout.tsx, app/globals.css     # root layout + design token Tailwind v4
app/page.tsx                        # home storefront
app/(auth)/login/page.tsx, app/(auth)/register/page.tsx
app/kategori/[slug]/page.tsx, app/produk/[slug]/page.tsx, app/cari/page.tsx
app/cart/page.tsx, app/checkout/page.tsx
app/payment/[orderCode]/page.tsx    # halaman mock gateway (client component)
app/akun/pesanan/page.tsx, app/akun/pesanan/[orderCode]/page.tsx
app/admin/layout.tsx                # guard requireAdmin()
app/admin/produk/page.tsx, app/admin/produk/baru/page.tsx, app/admin/produk/[id]/edit/page.tsx
app/admin/pesanan/page.tsx, app/admin/pesanan/[orderCode]/page.tsx
app/uploads/[...path]/route.ts      # serve var/uploads (proteksi path traversal)
src/lib/format.ts                   # formatIDR
src/lib/constants.ts                # SHIPPING_FLAT_COST
src/lib/order-status.ts             # enum re-export + peta transisi + helper
src/server/db.ts                    # Prisma client singleton
src/server/session.ts               # hash/verify password, JWT cookie, requireUser/requireAdmin, assertRole
src/server/domain/catalog.ts        # baca katalog (storefront & admin)
src/server/domain/admin-catalog.ts  # saveProduct, toggleProductActive (aturan varian terjual)
src/server/domain/cart.ts           # cart per user + validasi stok
src/server/domain/orders.ts         # createOrderFromCart, transitionOrder, adminTransition, query order
src/server/domain/payments/index.ts # interface PaymentProvider + CardInput
src/server/domain/payments/mock-gateway.ts  # validateCard, shouldDecline, confirmPayment
src/server/domain/shipping/index.ts # interface ShippingProvider
src/server/domain/shipping/mock-courier.ts  # generate resi MKX-######
src/server/actions/auth.ts          # registerAction, loginAction, logoutAction
src/server/actions/storefront.ts    # cart, createOrder, confirmPayment
src/server/actions/admin.ts         # saveProduct, toggleProductActive, adminOrderTransition
src/components/storefront/header.tsx, footer.tsx, product-card.tsx, status-chip.tsx, order-timeline.tsx
src/components/variant-picker.tsx   # client: pilih warna/ukuran → form add-to-cart
src/components/qty-stepper.tsx      # client: ubah qty cart via server action
tests/global-setup.ts, tests/setup.ts, tests/helpers/db.ts, tests/helpers/factories.ts
tests/unit/*.test.ts, tests/integration/*.test.ts
vitest.config.ts
public/images/products/*.jpg        # hasil generate ImageGen (task 5)
var/uploads/                        # upload runtime admin
```

---

### Task 1: Scaffold repo, infra Docker, dan skema Prisma

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `docker-compose.yml`, `prisma/schema.prisma`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder), `.env` (local dari example, tidak di-commit)

**Interfaces:**
- Consumes: tidak ada (task pertama)
- Produces: `prisma migrate dev` menghasilkan Prisma Client untuk semua model; script npm `dev`, `db:up`, `db:migrate`, `db:seed`, `test`; env contract `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`

- [ ] **Step 1: Tulis file konfigurasi dasar**

`package.json`:

```json
{
  "name": "ecommerce-demo",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "db:up": "docker compose up -d",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "test": "vitest run"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "@prisma/client": "^6.16.0",
    "jose": "^6.0.0",
    "next": "^15.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "prisma": "^6.16.0",
    "tailwindcss": "^4.1.0",
    "tsx": "^4.19.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`.gitignore`:

```
node_modules/
.next/
.env
*.tsbuildinfo
next-env.d.ts
var/uploads/*
!var/uploads/.gitkeep
```

`.env.example`:

```
DATABASE_URL="postgresql://ecommerce:ecommerce@localhost:5432/ecommerce"
TEST_DATABASE_URL="postgresql://ecommerce:ecommerce@localhost:5433/ecommerce_test"
SESSION_SECRET="ganti-dengan-secret-acak-32-karakter"
```

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: ecommerce
      POSTGRES_DB: ecommerce
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecommerce -d ecommerce"]
      interval: 3s
      timeout: 3s
      retries: 10
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: ecommerce
      POSTGRES_DB: ecommerce_test
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecommerce -d ecommerce_test"]
      interval: 3s
      timeout: 3s
      retries: 10
```

- [ ] **Step 2: Install dependencies dan siapkan env lokal**

Run:
```bash
npm install
cp .env.example .env
mkdir -p var/uploads && touch var/uploads/.gitkeep
```
Expected: `node_modules/` terbentuk tanpa error; `.env` ada (jangan commit).

- [ ] **Step 3: Tulis skema Prisma lengkap**

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  CUSTOMER
  ADMIN
}

enum OrderStatus {
  PENDING
  PAID
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  name         String
  role         Role      @default(CUSTOMER)
  createdAt    DateTime  @default(now())
  addresses    Address[]
  cart         Cart?
  orders       Order[]
}

model Address {
  id         String  @id @default(cuid())
  userId     String
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  recipient    String
  phone        String
  line1        String
  city         String
  province     String
  postalCode   String
  isDefault    Boolean @default(false)
  orders       Order[]
}

model Category {
  id       String    @id @default(cuid())
  name     String
  slug     String    @unique
  products Product[]
}

model Product {
  id          String           @id @default(cuid())
  categoryId  String
  category    Category         @relation(fields: [categoryId], references: [id])
  name        String
  slug        String           @unique
  description String
  basePrice   Int
  images      String[]
  isActive    Boolean          @default(true)
  createdAt   DateTime         @default(now())
  variants    ProductVariant[]
}

model ProductVariant {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  colorName String
  colorHex  String
  size      String
  stock     Int     @default(0)
  sku       String  @unique
  cartItems CartItem[]
  orderItems OrderItem[]

  @@unique([productId, colorName, size])
}

model Cart {
  id     String     @id @default(cuid())
  userId String     @unique
  user   User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  items  CartItem[]
}

model CartItem {
  id       String         @id @default(cuid())
  cartId   String
  cart     Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variantId String
  variant  ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  qty      Int

  @@unique([cartId, variantId])
}

model Order {
  id            String      @id @default(cuid())
  code          String      @unique
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  status        OrderStatus @default(PENDING)
  subtotal      Int
  shippingCost  Int
  total         Int
  shipRecipient String
  shipPhone     String
  shipLine1     String
  shipCity      String
  shipProvince  String
  shipPostalCode String
  createdAt     DateTime    @default(now())
  items         OrderItem[]
  payment       Payment?
  shipment      Shipment?
  events        OrderEvent[]
}

model OrderItem {
  id           String         @id @default(cuid())
  orderId      String
  order        Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variantId    String
  variant      ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  productName  String
  variantLabel String
  unitPrice    Int
  qty          Int
}

model Payment {
  id       String        @id @default(cuid())
  orderId  String        @unique
  order    Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  provider String
  method   String
  status   PaymentStatus @default(PENDING)
  last4    String?
  paidAt   DateTime?
}

model Shipment {
  id             String   @id @default(cuid())
  orderId        String   @unique
  order          Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  carrier        String
  trackingNumber String
  createdAt      DateTime @default(now())
}

model OrderEvent {
  id        String      @id @default(cuid())
  orderId   String
  order     Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status    OrderStatus
  note      String?
  createdAt DateTime    @default(now())
}
```

- [ ] **Step 4: Naikkan database dan jalankan migrasi awal**

Run:
```bash
npm run db:up
npx prisma migrate dev --name init
```
Expected: dua container postgres sehat (`docker compose ps`), migrasi `init` terbuat di `prisma/migrations/`, Prisma Client ter-generate.

- [ ] **Step 5: Tulis root layout, globals.css, dan halaman placeholder**

`app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-cream: #f4f6ec;
  --color-lime: #c8f169;
  --color-olive: #2f3b22;
  --color-sage: #a9c3a2;
  --color-card: #ececec;
  --font-display: "Archivo", "Inter Tight", system-ui, sans-serif;
}

body {
  background: var(--color-cream);
  color: var(--color-olive);
  font-family: var(--font-display);
}
```

`app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Easternstack Store",
  description: "Demo e-commerce end-to-end",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx` (placeholder, diganti Task 8):

```tsx
export default function Home() {
  return <main className="p-8">Easternstack Store — scaffold OK</main>;
}
```

- [ ] **Step 6: Verifikasi dev server dan migrasi**

Run:
```bash
npx prisma migrate status
npm run dev &
sleep 4
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```
Expected: `migrate status` melaporkan database up to date; curl mencetak `200`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs .gitignore .env.example docker-compose.yml prisma app var
git commit -m "chore: scaffold next.js + prisma + docker infra"
```

---

### Task 2: Infra test Vitest + lib murni (formatIDR, order-status)

**Files:**
- Create: `vitest.config.ts`, `tests/global-setup.ts`, `tests/setup.ts`, `tests/helpers/db.ts`, `tests/helpers/factories.ts`, `tests/unit/format.test.ts`, `tests/unit/order-status.test.ts`, `src/lib/format.ts`, `src/lib/constants.ts`, `src/lib/order-status.ts`, `src/server/db.ts`

**Interfaces:**
- Consumes: Prisma Client dari Task 1
- Produces: `formatIDR(rupiah: number): string`; `SHIPPING_FLAT_COST: number`; `canTransition(from, to): boolean`, `allowedTargets(from): OrderStatus[]`, `isCancellable(s): boolean`; `prisma` singleton; helper test `cleanDb()`, `makeUser/makeCategory/makeProduct`

- [ ] **Step 1: Tulis test gagal untuk formatIDR dan transisi status**

`tests/unit/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatIDR } from "@/lib/format";

describe("formatIDR", () => {
  it("memformat rupiah tanpa desimal", () => {
    expect(formatIDR(89900)).toBe("Rp89.900");
  });
  it("memformat nol", () => {
    expect(formatIDR(0)).toBe("Rp0");
  });
  it("memformat jutaan", () => {
    expect(formatIDR(1250000)).toBe("Rp1.250.000");
  });
});
```

`tests/unit/order-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allowedTargets, canTransition, isCancellable } from "@/lib/order-status";

describe("peta transisi status order", () => {
  it("mengizinkan alur bahagia", () => {
    expect(canTransition("PENDING", "PAID")).toBe(true);
    expect(canTransition("PAID", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
  });
  it("menolak lompatan status", () => {
    expect(canTransition("PENDING", "SHIPPED")).toBe(false);
    expect(canTransition("PAID", "DELIVERED")).toBe(false);
    expect(canTransition("PROCESSING", "PAID")).toBe(false);
  });
  it("menolak cancel setelah shipped", () => {
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(isCancellable("SHIPPED")).toBe(false);
  });
  it("mengizinkan cancel sebelum shipped", () => {
    expect(isCancellable("PENDING")).toBe(true);
    expect(isCancellable("PAID")).toBe(true);
    expect(isCancellable("PROCESSING")).toBe(true);
  });
  it("status terminal tidak punya target", () => {
    expect(allowedTargets("DELIVERED")).toEqual([]);
    expect(allowedTargets("CANCELLED")).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/unit`
Expected: FAIL — modul `@/lib/format` dan `@/lib/order-status` belum ada.

- [ ] **Step 3: Tulis infra test dan implementasi lib**

`vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

`tests/global-setup.ts`:

```ts
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL belum diset; salin .env.example ke .env");
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
```

`tests/setup.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(__dirname, "../.env");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
```

`tests/helpers/db.ts`:

```ts
import { prisma } from "@/server/db";

export async function cleanDb() {
  await prisma.orderEvent.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
}
```

`tests/helpers/factories.ts`:

```ts
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
```

`src/lib/format.ts`:

```ts
const formatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

export function formatIDR(rupiah: number): string {
  return formatter.format(rupiah).replace(/\s/g, "");
}
```

`src/lib/constants.ts`:

```ts
export const SHIPPING_FLAT_COST = 15000;
```

`src/lib/order-status.ts`:

```ts
import type { OrderStatus } from "@prisma/client";

export const VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function allowedTargets(from: OrderStatus): OrderStatus[] {
  return [...VALID_TRANSITIONS[from]];
}

export function isCancellable(status: OrderStatus): boolean {
  return canTransition(status, "CANCELLED");
}
```

`src/server/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/unit`
Expected: PASS (8 test). Test integration helper belum dipakai di task ini.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests src/lib src/server/db.ts
git commit -m "test: setup vitest + lib format & transisi status order"
```

---

### Task 3: Session, password hash, dan halaman auth

**Files:**
- Create: `src/server/session.ts`, `src/server/actions/auth.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `tests/unit/password.test.ts`, `tests/unit/assert-role.test.ts`
- Modify: `app/layout.tsx` (tidak perlu; auth pages memakai root layout)

**Interfaces:**
- Consumes: `prisma` (Task 2), env `SESSION_SECRET`
- Produces: `hashPassword(plain): Promise<string>`, `verifyPassword(plain, stored): Promise<boolean>`, `assertRole(session, role): Session` (throw `Error("FORBIDDEN")`), `getCurrentSession(): Promise<Session|null>`, `requireUser(): Promise<Session>`, `requireAdmin(): Promise<Session>`, `loginSession(userId, role)`, `logoutSession()`; Server Actions `registerAction`, `loginAction`, `logoutAction`

- [ ] **Step 1: Tulis test gagal untuk password dan assertRole**

`tests/unit/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/session";

describe("password hashing", () => {
  it("verifikasi benar untuk password yang sama", async () => {
    const hash = await hashPassword("rahasia123");
    await expect(verifyPassword("rahasia123", hash)).resolves.toBe(true);
  });
  it("menolak password berbeda", async () => {
    const hash = await hashPassword("rahasia123");
    await expect(verifyPassword("salah123", hash)).resolves.toBe(false);
  });
  it("hash berbeda untuk password sama (salt acak)", async () => {
    const a = await hashPassword("rahasia123");
    const b = await hashPassword("rahasia123");
    expect(a).not.toBe(b);
  });
});
```

`tests/unit/assert-role.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertRole, type Session } from "@/server/session";

const admin: Session = { userId: "u1", role: "ADMIN" };
const customer: Session = { userId: "u2", role: "CUSTOMER" };

describe("assertRole", () => {
  it("meloloskan session dengan role sesuai", () => {
    expect(assertRole(admin, "ADMIN")).toEqual(admin);
  });
  it("menolak role berbeda", () => {
    expect(() => assertRole(customer, "ADMIN")).toThrow("FORBIDDEN");
  });
  it("menolak session null", () => {
    expect(() => assertRole(null, "CUSTOMER")).toThrow("FORBIDDEN");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/unit`
Expected: FAIL — `@/server/session` belum ada.

- [ ] **Step 3: Implementasikan session.ts**

`src/server/session.ts`:

```ts
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";

const scrypt = promisify(scryptCb);

export type Role = "CUSTOMER" | "ADMIN";
export type Session = { userId: string; role: Role };

const COOKIE_NAME = "esv_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET belum diset");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(plain, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const candidate = (await scrypt(plain, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function assertRole(session: Session | null, role: Role): Session {
  if (!session || session.role !== role) throw new Error("FORBIDDEN");
  return session;
}

export async function loginSession(userId: string, role: Role): Promise<void> {
  const token = await new SignJWT({ role })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function logoutSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getCurrentSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { userId: payload.sub as string, role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "ADMIN") redirect("/");
  return session;
}
```

- [ ] **Step 4: Jalankan test unit, pastikan lulus**

Run: `npx vitest run tests/unit`
Expected: PASS (14 test).

- [ ] **Step 5: Tulis Server Actions auth**

`src/server/actions/auth.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { hashPassword, loginSession, logoutSession, verifyPassword } from "@/server/session";

export type AuthState = { error?: string } | null;

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || password.length < 8) {
    return { error: "Nama, email, dan password minimal 8 karakter wajib diisi." };
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Email sudah terdaftar." };
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });
  await loginSession(user.id, user.role);
  redirect("/");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Email atau password salah." };
  }
  await loginSession(user.id, user.role);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction(): Promise<void> {
  await logoutSession();
  redirect("/");
}
```

- [ ] **Step 6: Tulis halaman login & register**

`app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthState } from "@/server/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(loginAction, null);
  const next = useSearchParams().get("next") ?? "";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Masuk</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input name="email" type="email" required placeholder="Email"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        <input name="password" type="password" required placeholder="Password"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button disabled={pending}
          className="rounded-full border border-olive px-4 py-2 text-sm font-semibold uppercase tracking-wide hover:bg-lime">
          {pending ? "Memproses…" : "Masuk"}
        </button>
      </form>
      <p className="text-sm">
        Belum punya akun? <a className="underline" href="/register">Daftar</a>
      </p>
    </main>
  );
}
```

Catatan: bungkus `useSearchParams` butuh `Suspense`; tambahkan di file yang sama:

```tsx
import { Suspense } from "react";
// export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
```

yaitu: ganti nama fungsi di atas menjadi `LoginInner` dan export default menjadi:

```tsx
export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
```

`app/(auth)/register/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "@/server/actions/auth";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(registerAction, null);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Daftar</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input name="name" required placeholder="Nama lengkap"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        <input name="email" type="email" required placeholder="Email"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        <input name="password" type="password" required minLength={8} placeholder="Password (min. 8 karakter)"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button disabled={pending}
          className="rounded-full border border-olive px-4 py-2 text-sm font-semibold uppercase tracking-wide hover:bg-lime">
          {pending ? "Memproses…" : "Daftar"}
        </button>
      </form>
      <p className="text-sm">
        Sudah punya akun? <a className="underline" href="/login">Masuk</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Verifikasi manual auth via browser**

Run: `npm run dev`, buka `http://localhost:3000/register`, daftar akun `uji@demo.id / password123`, pastikan ter-redirect ke `/` dan cookie `esv_session` muncul di DevTools → Application → Cookies. Lalu logout belum ada UI (task 8 menambah header); verifikasi cookie ada saja.
Expected: redirect ke `/`, cookie `esv_session` httpOnly terbentuk.

- [ ] **Step 8: Commit**

```bash
git add src/server/session.ts src/server/actions/auth.ts app/\(auth\) tests/unit/password.test.ts tests/unit/assert-role.test.ts
git commit -m "feat: session jwt + hash scrypt + halaman login/register"
```

### Task 4: Domain catalog (baca katalog + search)

**Files:**
- Create: `src/server/domain/catalog.ts`, `tests/integration/catalog.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2)
- Produces: `listCategories(): Promise<Category[]>`; `listProducts(opts?: { categorySlug?: string; q?: string; includeInactive?: boolean }): Promise<CatalogProduct[]>`; `getProductBySlug(slug: string): Promise<ProductDetail | null>` dengan type:
  - `CatalogColor = { name: string; hex: string }`
  - `CatalogProduct = { id, slug, name, basePrice, images: string[], colors: CatalogColor[], sizes: string[] }`
  - `CatalogVariant = { id, colorName, colorHex, size, stock, sku }`
  - `ProductDetail = CatalogProduct & { description, categoryId, variants: CatalogVariant[] }`

- [ ] **Step 1: Tulis test integration gagal untuk catalog**

`tests/integration/catalog.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getProductBySlug, listProducts } from "@/server/domain/catalog";
import { prisma } from "@/server/db";
import { cleanDb, makeCategory, makeProduct } from "../helpers/db-factories";

beforeEach(cleanDb);

describe("catalog", () => {
  it("memfilter produk berdasarkan kategori dan menyembunyikan nonaktif", async () => {
    const catA = await makeCategory("Pria");
    const catB = await makeCategory("Tas");
    await makeProduct(catA.id, { isActive: true });
    await makeProduct(catA.id, { isActive: false });
    await makeProduct(catB.id, {});
    const pria = await listProducts({ categorySlug: "pria" });
    expect(pria).toHaveLength(1);
    const semua = await listProducts({});
    expect(semua).toHaveLength(2);
    const denganInactive = await listProducts({ includeInactive: true });
    expect(denganInactive).toHaveLength(3);
  });

  it("mencari produk berdasarkan nama (case-insensitive)", async () => {
    const cat = await makeCategory("Pria");
    await makeProduct(cat.id, {});
    const hasil = await listProducts({ q: "PRODUK" });
    expect(hasil.length).toBeGreaterThan(0);
    const tidakAda = await listProducts({ q: "zzz-tidak-ada" });
    expect(tidakAda).toHaveLength(0);
  });

  it("mengembalikan detail produk lengkap dengan varian, null untuk slug asing", async () => {
    const cat = await makeCategory("Pria");
    const created = await makeProduct(cat.id, {
      colors: [
        { name: "Hitam", hex: "#111111" },
        { name: "Sage", hex: "#a9c3a2" },
      ],
      sizes: ["S", "M"],
      stock: 3,
    });
    const detail = await getProductBySlug(created.slug);
    expect(detail?.variants).toHaveLength(4);
    expect(detail?.colors).toEqual([
      { name: "Hitam", hex: "#111111" },
      { name: "Sage", hex: "#a9c3a2" },
    ]);
    expect(detail?.sizes).toEqual(["S", "M"]);
    await expect(getProductBySlug("tidak-ada")).resolves.toBeNull();
  });
});
```

Catatan: pindahkan `makeUser/makeCategory/makeProduct` dari `tests/helpers/factories.ts` (Task 2) menjadi re-export gabungan di `tests/helpers/db-factories.ts`:

```ts
export * from "./db";
export * from "./factories";
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/integration/catalog.test.ts`
Expected: FAIL — `@/server/domain/catalog` belum ada (global-setup tetap migrate OK).

- [ ] **Step 3: Implementasikan catalog.ts**

`src/server/domain/catalog.ts`:

```ts
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
    include: { variants: true },
  });
  if (!product || !product.isActive) return null;
  return {
    ...toCatalogProduct(product),
    description: product.description,
    categoryId: product.categoryId,
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
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/integration/catalog.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/catalog.ts tests/integration/catalog.test.ts tests/helpers/db-factories.ts
git commit -m "feat: domain catalog dengan filter kategori & search"
```

---

### Task 5: Gambar produk (ImageGen) + seed data

**Files:**
- Create: `public/images/products/*.jpg` (18 gambar), `prisma/seed.ts`

**Interfaces:**
- Consumes: skema Prisma (Task 1), `hashPassword` (Task 3)
- Produces: database terisi: 2 user demo, 5 kategori, 12 produk dengan varian warna × ukuran + stok; konvensi nama gambar `<slug-produk>-<slug-warna>.jpg` dipakai PDP (Task 8) untuk memfilter galeri per warna

- [ ] **Step 1: Generate 18 gambar produk**

Gunakan tool ImageGen, satu gambar per panggilan, size `1024x1280`, gaya konsisten: "studio e-commerce fashion photo, model/produk di tengah, background abu-abu terang polos (#ececec), pencahayaan lembut, katalog minimal". Simpan ke `public/images/products/` dengan nama berikut (12 produk, produk pakaian 2 warna, aksesori 1 warna):

| file | subjek |
|---|---|
| `jaket-ringer-pria-hitam.jpg` | jaket ringer knit pria warna hitam, model pria berdiri |
| `jaket-ringer-pria-sage.jpg` | jaket ringer knit pria warna hijau sage |
| `kemeja-kotak-pria-krem.jpg` | kemeja boxy krem pria |
| `kemeja-kotak-pria-cokelat.jpg` | kemeja boxy cokelat pria |
| `cardigan-rajut-wanita-krem.jpg` | cardigan rajut zip wanita krem |
| `cardigan-rajut-wanita-hitam.jpg` | cardigan rajut zip wanita hitam |
| `celana-pleats-pria-olive.jpg` | celana pleats olive pria |
| `celana-pleats-pria-taupe.jpg` | celana pleats taupe pria |
| `tas-tote-kulit-cokelat.jpg` | tas tote kulit cokelat di podium putih |
| `tas-selempang-kulit-hitam.jpg` | tas selempang kulit hitam di podium putih |
| `kacamata-hitam-frame-hitam.jpg` | kacamata hitam frame hitam produk still-life |
| `beanie-rajut-wol-hitam.jpg` | beanie rajut wol hitam produk still-life |

Plus 6 gambar sudut/detail tambahan untuk 6 produk pakaian pertama (galeri): `jaket-ringer-pria-hitam-detail.jpg`, `jaket-ringer-pria-sage-detail.jpg`, `kemeja-kotak-pria-krem-detail.jpg`, `kemeja-kotak-pria-cokelat-detail.jpg`, `cardigan-rajut-wanita-krem-detail.jpg`, `cardigan-rajut-wanita-hitam-detail.jpg`.

Expected: 18 file ada di `public/images/products/`.

- [ ] **Step 2: Tulis seed script**

`prisma/seed.ts`:

```ts
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
    extraImages: ["detail"],
  },
  {
    name: "Kemeja Boxy Lipit Pria", slug: "kemeja-kotak-pria", category: "pria",
    description: "Kemeja boxy dengan krease lipit, bahan twill tebal.",
    basePrice: 385000,
    variants: [
      { color: "Krem", hex: "#e8dcc8", sizes: { M: 6, L: 6, XL: 4 } },
      { color: "Cokelat", hex: "#5b4232", sizes: { M: 5, L: 4, XL: 2 } },
    ],
    extraImages: ["detail"],
  },
  {
    name: "Cardigan Rajut Zip Wanita", slug: "cardigan-rajut-wanita", category: "wanita",
    description: "Cardigan rajut kabel dengan zip dua arah, potongan cropped.",
    basePrice: 429000,
    variants: [
      { color: "Krem", hex: "#e8dcc8", sizes: { S: 5, M: 6 } },
      { color: "Hitam", hex: "#1c1c1c", sizes: { S: 4, M: 4 } },
    ],
    extraImages: ["detail"],
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
    const images = p.variants.map((v) => `/images/products/${p.slug}-${slugColor(v.color)}.jpg`);
    for (const extra of p.extraImages ?? []) {
      for (const v of p.variants) {
        images.push(`/images/products/${p.slug}-${slugColor(v.color)}-${extra}.jpg`);
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
```

Catatan gambar: 6 produk pertama di seed memakai `extraImages: ["detail"]` sehingga mengharapkan file `*-detail.jpg` sesuai Step 1. Produk `kaus-lengan-panjang`, `rok-pleats-wanita`, `sweater-wanita`, `beanie-ombre` memakai gambar warna yang sama dengan produk lain bila file belum ada — **generate juga 8 gambar tambahan** bila belum: `kaus-lengan-panjang-putih.jpg`, `kaus-lengan-panjang-hitam.jpg`, `rok-pleats-wanita-sage.jpg`, `rok-pleats-wanita-krem.jpg`, `sweater-wanita-taupe.jpg`, `sweater-wanita-hitam.jpg`, `beanie-ombre-cokelat.jpg` (7 file). Total gambar = 12 + 6 + 7 = 25; sesuaikan jumlah panggilan ImageGen (grup 4-5 gambar per langkah kerja).

- [ ] **Step 3: Jalankan seed dan verifikasi isi database**

Run:
```bash
npm run db:seed
npx prisma studio &
sleep 3
```
Verifikasi via studio atau query: 2 user, 5 kategori, 12 produk, jumlah varian = 2*3+2*3+2*2+2*3+1+1+1+1+2*3+2*2+2*2+1 = 44 varian.
Expected: output "Seed selesai: 12 produk".

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts public/images
git commit -m "feat: seed data demo + gambar produk generate"
```

---

### Task 6: Domain cart

**Files:**
- Create: `src/server/domain/cart.ts`, `tests/integration/cart.test.ts`

**Interfaces:**
- Consumes: `prisma`
- Produces: `getCartView(userId): Promise<CartView>`; `addToCart(userId, variantId, qty): Promise<Result>`; `setCartQty(userId, variantId, qty): Promise<Result>`; `removeCartItem(userId, variantId): Promise<{ok:true}>`; `clearCart(userId): Promise<void>`; type `CartItemView = { variantId, qty, unitPrice, lineTotal, stock, productName, variantLabel, image: string|null, slug, active: boolean }`, `CartView = { items: CartItemView[], subtotal, itemCount }`; `Result = { ok: true } | { error: string }`

- [ ] **Step 1: Tulis test integration gagal untuk cart**

`tests/integration/cart.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { addToCart, getCartView, setCartQty, removeCartItem } from "@/server/domain/cart";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

beforeEach(cleanDb);

describe("cart", () => {
  it("menambah item baru dan menggabungkan qty untuk varian sama", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 10 });
    const variant = product.variants[0];
    await addToCart(user.id, variant.id, 2);
    await addToCart(user.id, variant.id, 3);
    const view = await getCartView(user.id);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].qty).toBe(5);
    expect(view.subtotal).toBe(view.items[0].unitPrice * 5);
  });

  it("menolak menambah melebihi stok", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 2 });
    const result = await addToCart(user.id, product.variants[0].id, 5);
    expect(result).toEqual({ error: "Stok tidak mencukupi." });
  });

  it("menolak varian dari produk nonaktif", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { isActive: false });
    const result = await addToCart(user.id, product.variants[0].id, 1);
    expect(result).toEqual({ error: "Produk tidak tersedia." });
  });

  it("setCartQty 0 menghapus item", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 10 });
    await addToCart(user.id, product.variants[0].id, 2);
    await setCartQty(user.id, product.variants[0].id, 0);
    const view = await getCartView(user.id);
    expect(view.items).toHaveLength(0);
  });

  it("removeCartItem menghapus baris", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, {});
    await addToCart(user.id, product.variants[0].id, 1);
    await removeCartItem(user.id, product.variants[0].id);
    expect((await getCartView(user.id)).items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/integration/cart.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasikan cart.ts**

`src/server/domain/cart.ts`:

```ts
import { prisma } from "@/server/db";

export type Result = { ok: true } | { error: string };

export type CartItemView = {
  variantId: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  productName: string;
  variantLabel: string;
  image: string | null;
  slug: string;
  active: boolean;
};

export type CartView = { items: CartItemView[]; subtotal: number; itemCount: number };

async function ensureCart(userId: string) {
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId } });
}

export async function getCartView(userId: string): Promise<CartView> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: { variant: { include: { product: true } } },
      },
    },
  });
  if (!cart) return { items: [], subtotal: 0, itemCount: 0 };
  const items: CartItemView[] = cart.items.map((item) => ({
    variantId: item.variantId,
    qty: item.qty,
    unitPrice: item.variant.product.basePrice,
    lineTotal: item.qty * item.variant.product.basePrice,
    stock: item.variant.stock,
    productName: item.variant.product.name,
    variantLabel: `${item.variant.colorName} / ${item.variant.size}`,
    image: item.variant.product.images[0] ?? null,
    slug: item.variant.product.slug,
    active: item.variant.product.isActive,
  }));
  return {
    items,
    subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
    itemCount: items.reduce((sum, i) => sum + i.qty, 0),
  };
}

export async function addToCart(userId: string, variantId: string, qty: number): Promise<Result> {
  if (qty < 1) return { error: "Jumlah tidak valid." };
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });
  if (!variant || !variant.product.isActive) return { error: "Produk tidak tersedia." };
  const cart = await ensureCart(userId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });
  const desired = (existing?.qty ?? 0) + qty;
  if (desired > variant.stock) return { error: "Stok tidak mencukupi." };
  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: desired } });
  } else {
    await prisma.cartItem.create({ data: { cartId: cart.id, variantId, qty } });
  }
  return { ok: true };
}

export async function setCartQty(userId: string, variantId: string, qty: number): Promise<Result> {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return { error: "Keranjang kosong." };
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });
  if (!existing) return { error: "Item tidak ada di keranjang." };
  if (qty < 1) {
    await prisma.cartItem.delete({ where: { id: existing.id } });
    return { ok: true };
  }
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) return { error: "Varian tidak ditemukan." };
  if (qty > variant.stock) return { error: "Stok tidak mencukupi." };
  await prisma.cartItem.update({ where: { id: existing.id }, data: { qty } });
  return { ok: true };
}

export async function removeCartItem(userId: string, variantId: string): Promise<{ ok: true }> {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
  }
  return { ok: true };
}

export async function clearCart(userId: string): Promise<void> {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/integration/cart.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/cart.ts tests/integration/cart.test.ts
git commit -m "feat: domain cart dengan validasi stok"
```

---

### Task 7: Domain orders + mock payment + mock courier

**Files:**
- Create: `src/server/domain/orders.ts`, `src/server/domain/payments/index.ts`, `src/server/domain/payments/mock-gateway.ts`, `src/server/domain/shipping/index.ts`, `src/server/domain/shipping/mock-courier.ts`, `tests/unit/mock-gateway.test.ts`, `tests/integration/orders.test.ts`

**Interfaces:**
- Consumes: `prisma`, `canTransition/allowedTargets` (Task 2), `assertRole` + `Session` (Task 3), `clearCart` (Task 6), `SHIPPING_FLAT_COST` (Task 2)
- Produces:
  - orders: `createOrderFromCart(userId, address: AddressInput): Promise<{ok:true; orderCode:string} | {error:string}>`; `transitionOrder(orderId, to, opts?: {actor?: Session; note?: string}): Promise<Result>`; `adminTransition(orderCode, to, actor: Session|null): Promise<Result>`; `listOrdersForUser(userId): Promise<OrderSummary[]>`; `getOrderForUser(userId, code): Promise<OrderDetail|null>`; `listOrdersForAdmin(status?: OrderStatus): Promise<AdminOrderSummary[]>`; `getOrderForAdmin(code): Promise<OrderDetail|null>`; type `AddressInput = { recipient, phone, line1, city, province, postalCode }`
  - payments: `CardInput = { cardNumber, expiry, cvc }`; `validateCard(input): {ok:true}|{error:string}`; `shouldDecline(cardNumber): boolean`; `confirmPayment(orderCode, input): Promise<Result>`
  - shipping: `mockCourier.createShipment(orderId): Promise<{carrier, trackingNumber}>`

- [ ] **Step 1: Tulis test unit gagal untuk mock gateway**

`tests/unit/mock-gateway.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldDecline, validateCard } from "@/server/domain/payments/mock-gateway";

describe("mock gateway rules", () => {
  it("decline untuk kartu berakhiran 0002", () => {
    expect(shouldDecline("4242 4242 4242 0002")).toBe(true);
    expect(shouldDecline("4242424242420002")).toBe(true);
  });
  it("sukses untuk kartu lain", () => {
    expect(shouldDecline("4242 4242 4242 4242")).toBe(false);
  });
  it("validasi format nomor kartu 16 digit", () => {
    expect(validateCard({ cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" })).toEqual({ ok: true });
    expect(validateCard({ cardNumber: "4242", expiry: "12/29", cvc: "123" })).toMatchObject({ error: expect.any(String) });
  });
  it("validasi expiry MM/YY di masa depan", () => {
    expect(validateCard({ cardNumber: "4242424242424242", expiry: "01/20", cvc: "123" })).toMatchObject({ error: expect.any(String) });
  });
  it("validasi cvc 3 digit", () => {
    expect(validateCard({ cardNumber: "4242424242424242", expiry: "12/29", cvc: "12" })).toMatchObject({ error: expect.any(String) });
  });
});
```

- [ ] **Step 2: Tulis test integration gagal untuk orders**

`tests/integration/orders.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addToCart } from "@/server/domain/cart";
import {
  adminTransition,
  createOrderFromCart,
  getOrderForAdmin,
  transitionOrder,
} from "@/server/domain/orders";
import { confirmPayment } from "@/server/domain/payments/mock-gateway";
import type { Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

const admin: Session = { userId: "admin-test", role: "ADMIN" };
const customerSession = (userId: string): Session => ({ userId, role: "CUSTOMER" });

const address = {
  recipient: "Budi",
  phone: "081234567890",
  line1: "Jl. Melati No. 1",
  city: "Bandung",
  province: "Jawa Barat",
  postalCode: "40115",
};

beforeEach(cleanDb);

async function setupCart(stock = 5) {
  const user = await makeUser();
  const cat = await makeCategory();
  const product = await makeProduct(cat.id, { stock });
  await addToCart(user.id, product.variants[0].id, 2);
  return { user, product };
}

describe("createOrderFromCart", () => {
  it("membuat order PENDING, mengurangi stok, dan mengosongkan cart", async () => {
    const { user, product } = await setupCart(5);
    const result = await createOrderFromCart(user.id, address);
    expect(result).toMatchObject({ ok: true });
    const code = (result as { ok: true; orderCode: string }).orderCode;
    const order = await prisma.order.findUnique({ where: { code }, include: { items: true, payment: true, events: true } });
    expect(order?.status).toBe("PENDING");
    expect(order?.items).toHaveLength(1);
    expect(order?.shippingCost).toBe(15000);
    expect(order?.payment?.status).toBe("PENDING");
    expect(order?.events.map((e) => e.status)).toEqual(["PENDING"]);
    const variant = await prisma.productVariant.findUnique({ where: { id: product.variants[0].id } });
    expect(variant?.stock).toBe(3);
    const cartView = await prisma.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(cartView).toHaveLength(0);
  });

  it("rollback seluruh transaksi saat stok tidak mencukupi", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const a = await makeProduct(cat.id, { stock: 5 });
    const b = await makeProduct(cat.id, { stock: 1 });
    await addToCart(user.id, a.variants[0].id, 2);
    await prisma.cartItem.create({
      data: { cart: { connect: { userId: user.id } }, variantId: b.variants[0].id, qty: 3 },
    });
    const result = await createOrderFromCart(user.id, address);
    expect(result).toEqual({ error: "Stok tidak mencukupi." });
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.productVariant.findUnique({ where: { id: a.variants[0].id } }))?.stock).toBe(5);
  });

  it("menolak cart kosong", async () => {
    const user = await makeUser();
    await expect(createOrderFromCart(user.id, address)).resolves.toEqual({ error: "Keranjang kosong." });
  });
});

describe("confirmPayment", () => {
  it("sukses: payment SUCCESS dan order PAID", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const result = await confirmPayment(orderCode, { cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" });
    expect(result).toEqual({ ok: true });
    const order = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true, events: true } });
    expect(order?.status).toBe("PAID");
    expect(order?.payment?.status).toBe("SUCCESS");
    expect(order?.payment?.last4).toBe("4242");
    expect(order?.events.at(-1)?.status).toBe("PAID");
  });

  it("decline: payment FAILED dan order tetap PENDING, retry memakai record sama", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const gagal = await confirmPayment(orderCode, { cardNumber: "4242424242420002", expiry: "12/29", cvc: "123" });
    expect(gagal).toMatchObject({ error: expect.any(String) });
    const order = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true } });
    expect(order?.status).toBe("PENDING");
    expect(order?.payment?.status).toBe("FAILED");
    const paymentId = order?.payment?.id;
    await confirmPayment(orderCode, { cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" });
    const after = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true } });
    expect(after?.payment?.id).toBe(paymentId);
    expect(after?.payment?.status).toBe("SUCCESS");
  });
});

describe("transisi status & cancel", () => {
  it("alur bahagia sampai delivered membuat resi", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    await confirmPayment(orderCode, { cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" });
    const order = await prisma.order.findUnique({ where: { code: orderCode } });
    expect(await transitionOrder(order!.id, "PROCESSING", { actor: admin })).toEqual({ ok: true });
    expect(await transitionOrder(order!.id, "SHIPPED", { actor: admin })).toEqual({ ok: true });
    const shipped = await prisma.order.findUnique({ where: { id: order!.id }, include: { shipment: true } });
    expect(shipped?.shipment?.trackingNumber).toMatch(/^MKX-\d{6}$/);
    expect(await transitionOrder(order!.id, "DELIVERED", { actor: admin })).toEqual({ ok: true });
  });

  it("menolak transisi invalid", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const order = await prisma.order.findUnique({ where: { code: orderCode } });
    const result = await transitionOrder(order!.id, "SHIPPED", { actor: admin });
    expect(result).toEqual({ error: "Transisi status tidak valid." });
  });

  it("cancel merestore stok", async () => {
    const { user, product } = await setupCart(5);
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const result = await adminTransition(orderCode, "CANCELLED", admin);
    expect(result).toEqual({ ok: true });
    const variant = await prisma.productVariant.findUnique({ where: { id: product.variants[0].id } });
    expect(variant?.stock).toBe(5);
  });

  it("adminTransition menolak role customer", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const result = await adminTransition(orderCode, "CANCELLED", customerSession(user.id));
    expect(result).toEqual({ error: "FORBIDDEN" });
  });

  it("getOrderForAdmin mengembalikan detail lengkap", async () => {
    const { user } = await setupCart();
    const { orderCode } = (await createOrderFromCart(user.id, address)) as { ok: true; orderCode: string };
    const detail = await getOrderForAdmin(orderCode);
    expect(detail?.items[0].productName).toBeTruthy();
    expect(detail?.shipCity).toBe("Bandung");
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/unit/mock-gateway.test.ts tests/integration/orders.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 4: Implementasikan payments & shipping**

`src/server/domain/payments/index.ts`:

```ts
export type CardInput = { cardNumber: string; expiry: string; cvc: string };
export type PaymentResult = { ok: true } | { error: string };

export interface PaymentProvider {
  validate(input: CardInput): { ok: true } | { error: string };
  settle(orderCode: string, input: CardInput): Promise<PaymentResult>;
}
```

`src/server/domain/payments/mock-gateway.ts`:

```ts
import { prisma } from "@/server/db";
import { transitionOrder } from "@/server/domain/orders";
import type { CardInput, PaymentProvider } from "./index";

export function shouldDecline(cardNumber: string): boolean {
  return cardNumber.replace(/\D/g, "").endsWith("0002");
}

export function validateCard(input: CardInput): { ok: true } | { error: string } {
  const digits = input.cardNumber.replace(/\D/g, "");
  if (digits.length !== 16) return { error: "Nomor kartu harus 16 digit." };
  const m = input.expiry.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return { error: "Format expiry harus MM/YY." };
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  const now = new Date();
  const expiryEnd = new Date(year, month, 1);
  if (month < 1 || month > 12 || expiryEnd <= now) return { error: "Kartu kedaluwarsa." };
  if (!/^\d{3}$/.test(input.cvc)) return { error: "CVC harus 3 digit." };
  return { ok: true };
}

export const mockGateway: PaymentProvider = {
  validate: validateCard,
  settle: (orderCode, input) => confirmPayment(orderCode, input),
};

export async function confirmPayment(orderCode: string, input: CardInput): Promise<PaymentResult> {
  const validation = validateCard(input);
  if (validation !== undefined && "error" in validation) return validation;
  const order = await prisma.order.findUnique({ where: { code: orderCode }, include: { payment: true } });
  if (!order || !order.payment) return { error: "Pesanan tidak ditemukan." };
  if (order.status !== "PENDING") return { error: "Pesanan sudah tidak menunggu pembayaran." };
  const last4 = input.cardNumber.replace(/\D/g, "").slice(-4);
  if (shouldDecline(input.cardNumber)) {
    await prisma.payment.update({
      where: { orderId: order.id },
      data: { status: "FAILED", last4, method: "Kartu Kredit (MockPay)" },
    });
    return { error: "Pembayaran ditolak oleh penerbit kartu (mock)." };
  }
  await prisma.$transaction([
    prisma.payment.update({
      where: { orderId: order.id },
      data: { status: "SUCCESS", last4, method: "Kartu Kredit (MockPay)", paidAt: new Date() },
    }),
    prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
    prisma.orderEvent.create({ data: { orderId: order.id, status: "PAID", note: "Pembayaran diterima (MockPay)" } }),
  ]);
  void transitionOrder;
  return { ok: true };
}
```

Catatan: baris `void transitionOrder;` hanya penanda import dipakai tipe; **hapus import `transitionOrder` dan baris `void` tersebut** — transisi PENDING→PAID ditulis langsung sebagai transaksi di atas (satu-satunya pengecualian yang diizinkan, karena payment-lah pemilik peristiwa PAID). Implementasi final tidak meng-import orders untuk menghindari siklus import.

`src/server/domain/shipping/index.ts`:

```ts
export interface ShippingProvider {
  createShipment(orderId: string): Promise<{ carrier: string; trackingNumber: string }>;
}
```

`src/server/domain/shipping/mock-courier.ts`:

```ts
import { randomInt } from "node:crypto";
import { prisma } from "@/server/db";
import type { ShippingProvider } from "./index";

export const mockCourier: ShippingProvider = {
  async createShipment(orderId: string) {
    const trackingNumber = `MKX-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    await prisma.shipment.create({ data: { orderId, carrier: "Mock Express", trackingNumber } });
    return { carrier: "Mock Express", trackingNumber };
  },
};
```

- [ ] **Step 5: Implementasikan orders.ts**

`src/server/domain/orders.ts`:

```ts
import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";
import { SHIPPING_FLAT_COST } from "@/lib/constants";
import { canTransition } from "@/lib/order-status";
import { prisma } from "@/server/db";
import { assertRole, type Session } from "@/server/session";
import { clearCart, type Result } from "@/server/domain/cart";
import { mockCourier } from "@/server/domain/shipping/mock-courier";

export type AddressInput = {
  recipient: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
  postalCode: string;
};

export type OrderSummary = {
  code: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  itemCount: number;
  customerName?: string;
};

export type OrderItemView = {
  productName: string;
  variantLabel: string;
  unitPrice: number;
  qty: number;
};

export type OrderDetail = OrderSummary & {
  subtotal: number;
  shippingCost: number;
  items: OrderItemView[];
  shipping: AddressInput;
  payment: { provider: string; method: string; status: string; last4: string | null; paidAt: Date | null } | null;
  shipment: { carrier: string; trackingNumber: string } | null;
  events: { status: OrderStatus; note: string | null; createdAt: Date }[];
};

function generateOrderCode(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ESV-${y}${m}${d}-${suffix}`;
}

export async function createOrderFromCart(
  userId: string,
  address: AddressInput,
): Promise<{ ok: true; orderCode: string } | { error: string }> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  if (!cart || cart.items.length === 0) return { error: "Keranjang kosong." };

  const subtotal = cart.items.reduce((sum, i) => sum + i.qty * i.variant.product.basePrice, 0);
  const total = subtotal + SHIPPING_FLAT_COST;
  const orderCode = generateOrderCode();

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of cart.items) {
        const updated = await tx.productVariant.updateMany({
          where: { id: item.variantId, stock: { gte: item.qty } },
          data: { stock: { decrement: item.qty } },
        });
        if (updated.count !== 1) throw new Error("STOCK_INSUFFICIENT");
      }
      const order = await tx.order.create({
        data: {
          code: orderCode,
          userId,
          status: "PENDING",
          subtotal,
          shippingCost: SHIPPING_FLAT_COST,
          total,
          shipRecipient: address.recipient,
          shipPhone: address.phone,
          shipLine1: address.line1,
          shipCity: address.city,
          shipProvince: address.province,
          shipPostalCode: address.postalCode,
          items: {
            create: cart.items.map((item) => ({
              variantId: item.variantId,
              productName: item.variant.product.name,
              variantLabel: `${item.variant.colorName} / ${item.variant.size}`,
              unitPrice: item.variant.product.basePrice,
              qty: item.qty,
            })),
          },
          payment: { create: { provider: "mock", method: "Kartu Kredit (MockPay)", status: "PENDING" } },
          events: { create: { status: "PENDING", note: "Pesanan dibuat, menunggu pembayaran" } },
        },
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      void order;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STOCK_INSUFFICIENT") {
      return { error: "Stok tidak mencukupi." };
    }
    throw e;
  }
  return { ok: true, orderCode };
}

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  opts: { actor?: Session; note?: string } = {},
): Promise<Result> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Pesanan tidak ditemukan." };
  if (!canTransition(order.status, to)) return { error: "Transisi status tidak valid." };

  if (to === "SHIPPED") {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
      await tx.orderEvent.create({ data: { orderId, status: to, note: opts.note ?? "Paket diserahkan ke kurir" } });
    });
    await mockCourier.createShipment(orderId);
    return { ok: true };
  }

  if (to === "CANCELLED") {
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.qty } },
        });
      }
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
      await tx.orderEvent.create({ data: { orderId, status: to, note: opts.note ?? "Pesanan dibatalkan, stok dikembalikan" } });
    });
    return { ok: true };
  }

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: to } }),
    prisma.orderEvent.create({ data: { orderId, status: to, note: opts.note } }),
  ]);
  return { ok: true };
}

export async function adminTransition(orderCode: string, to: OrderStatus, actor: Session | null): Promise<Result> {
  try {
    assertRole(actor, "ADMIN");
  } catch {
    return { error: "FORBIDDEN" };
  }
  const order = await prisma.order.findUnique({ where: { code: orderCode } });
  if (!order) return { error: "Pesanan tidak ditemukan." };
  return transitionOrder(order.id, to, { actor: actor!, note: undefined });
}

function toSummary(order: {
  code: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  items: { qty: number }[];
  user?: { name: string };
}): OrderSummary {
  return {
    code: order.code,
    status: order.status,
    total: order.total,
    createdAt: order.createdAt,
    itemCount: order.items.reduce((s, i) => s + i.qty, 0),
    customerName: order.user?.name,
  };
}

export async function listOrdersForUser(userId: string): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: { select: { qty: true } } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map(toSummary);
}

export async function listOrdersForAdmin(status?: OrderStatus): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    include: { items: { select: { qty: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map(toSummary);
}

async function buildDetail(order: NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>> & {
  items: { productName: string; variantLabel: string; unitPrice: number; qty: number }[];
  payment: { provider: string; method: string; status: string; last4: string | null; paidAt: Date | null } | null;
  shipment: { carrier: string; trackingNumber: string } | null;
  events: { status: OrderStatus; note: string | null; createdAt: Date }[];
  user: { name: string } | null;
}): Promise<OrderDetail> {
  return {
    ...toSummary({ ...order, user: order.user ?? undefined }),
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    items: order.items,
    shipping: {
      recipient: order.shipRecipient,
      phone: order.shipPhone,
      line1: order.shipLine1,
      city: order.shipCity,
      province: order.shipProvince,
      postalCode: order.shipPostalCode,
    },
    payment: order.payment,
    shipment: order.shipment,
    events: order.events,
  };
}

const detailInclude = {
  items: { select: { productName: true, variantLabel: true, unitPrice: true, qty: true } },
  payment: true,
  shipment: true,
  events: { orderBy: { createdAt: "asc" as const } },
  user: { select: { name: true } },
};

export async function getOrderForUser(userId: string, code: string): Promise<OrderDetail | null> {
  const order = await prisma.order.findFirst({ where: { code, userId }, include: detailInclude });
  if (!order) return null;
  return buildDetail(order as Parameters<typeof buildDetail>[0]);
}

export async function getOrderForAdmin(code: string): Promise<OrderDetail | null> {
  const order = await prisma.order.findUnique({ where: { code }, include: detailInclude });
  if (!order) return null;
  return buildDetail(order as Parameters<typeof buildDetail>[0]);
}

export { Prisma };
```

Catatan implementasi: baris `export { Prisma };` tidak diperlukan — **hapus** import `Prisma` dan baris export tersebut; hanya `OrderStatus` type yang dipakai dari `@prisma/client`. `clearCart` tidak dipakai di orders (cart dikosongkan dalam transaksi) — **hapus** import `clearCart` agar tidak ada unused import.

- [ ] **Step 6: Jalankan seluruh test, pastikan lulus**

Run: `npx vitest run`
Expected: PASS semua (unit + integration, ±26 test).

- [ ] **Step 7: Commit**

```bash
git add src/server/domain/orders.ts src/server/domain/payments src/server/domain/shipping tests/unit/mock-gateway.test.ts tests/integration/orders.test.ts
git commit -m "feat: domain orders + mock payment gateway + mock courier"
```

### Task 8: Shell storefront + home + kategori + PDP + search + aksi cart

**Files:**
- Create: `app/(shop)/layout.tsx`, `app/(shop)/page.tsx`, `app/(shop)/kategori/[slug]/page.tsx`, `app/(shop)/produk/[slug]/page.tsx`, `app/(shop)/cari/page.tsx`, `src/components/storefront/header.tsx`, `src/components/storefront/footer.tsx`, `src/components/storefront/product-card.tsx`, `src/components/variant-picker.tsx`, `src/server/actions/storefront.ts`
- Delete: `app/page.tsx` (placeholder Task 1 pindah ke `(shop)`)

**Interfaces:**
- Consumes: `listCategories/listProducts/getProductBySlug` (Task 4), `getCurrentSession` (Task 3), `prisma` untuk hitung badge cart, `addToCart/setCartQty/removeCartItem` (Task 6)
- Produces: Server Actions `addToCartAction(formData): Promise<Result>`, `setCartQtyAction(variantId, qty): Promise<Result>`, `removeCartItemAction(variantId): Promise<Result>` (dipakai Task 9); komponen header/footer/product-card/variant-picker dipakai halaman lain

- [ ] **Step 1: Tulis Server Actions cart**

`src/server/actions/storefront.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { addToCart, removeCartItem, setCartQty, type Result } from "@/server/domain/cart";

export async function addToCartAction(formData: FormData): Promise<Result> {
  const session = await requireUser();
  const variantId = String(formData.get("variantId") ?? "");
  const qty = Number(formData.get("qty") ?? 1);
  const result = await addToCart(session.userId, variantId, qty);
  if ("error" in result) return result;
  redirect("/cart");
}

export async function setCartQtyAction(variantId: string, qty: number): Promise<Result> {
  const session = await requireUser();
  return setCartQty(session.userId, variantId, qty);
}

export async function removeCartItemAction(variantId: string): Promise<Result> {
  const session = await requireUser();
  return removeCartItem(session.userId, variantId);
}
```

- [ ] **Step 2: Tulis header & footer**

`src/components/storefront/header.tsx`:

```tsx
import Link from "next/link";
import { listCategories } from "@/server/domain/catalog";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { logoutAction } from "@/server/actions/auth";

async function cartCount(userId: string | undefined) {
  if (!userId) return 0;
  const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  return cart?.items.reduce((s, i) => s + i.qty, 0) ?? 0;
}

export async function Header() {
  const [session, categories] = await Promise.all([getCurrentSession(), listCategories()]);
  const count = await cartCount(session?.userId);
  return (
    <header className="border-b border-olive/10 bg-cream">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
        <Link href="/" className="text-xl font-extrabold uppercase tracking-tight">
          Easternstack<span className="font-light"> Store</span>
        </Link>
        <form action="/cari" className="flex-1">
          <input
            name="q"
            placeholder="Cari produk…"
            className="w-full rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none"
          />
        </form>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/cart" className="relative">
            Tas
            {count > 0 && (
              <span className="absolute -right-3 -top-2 rounded-full bg-lime px-1.5 text-xs font-bold">{count}</span>
            )}
          </Link>
          {session ? (
            <>
              <Link href="/akun/pesanan">Pesanan Saya</Link>
              {session.role === "ADMIN" && <Link href="/admin">Admin</Link>}
              <form action={logoutAction}>
                <button className="underline">Keluar</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Masuk</Link>
              <Link href="/register" className="rounded-full border border-olive px-3 py-1 font-semibold hover:bg-lime">
                Daftar
              </Link>
            </>
          )}
        </nav>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 pb-3 text-xs font-semibold uppercase tracking-widest">
        <Link href="/">Semua Kategori</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/kategori/${c.slug}`}>
            {c.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

`src/components/storefront/footer.tsx`:

```tsx
"use client";

import { useState } from "react";

export function Footer() {
  const [sent, setSent] = useState(false);
  return (
    <footer className="mt-16 border-t border-olive/10 bg-cream">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight">Tampil Percaya Diri</h2>
          <p className="mt-2 text-sm">
            Gaya timeless dan craft modern untuk keseharianmu.
          </p>
        </div>
        <div className="text-sm">
          <h3 className="font-bold uppercase tracking-widest">Bantuan</h3>
          <ul className="mt-2 space-y-1">
            <li>Lacak pesanan via menu Pesanan Saya</li>
            <li>Demo: pembayaran & pengiriman tiruan</li>
          </ul>
        </div>
        <div>
          <h3 className="font-bold uppercase tracking-widest">Kabar & Promo</h3>
          {sent ? (
            <p className="mt-2 text-sm">Terima kasih! Kamu terdaftar (demo).</p>
          ) : (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <input
                type="email"
                required
                placeholder="email@kamu.id"
                className="flex-1 rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none"
              />
              <button className="rounded-full bg-lime px-4 py-2 text-sm font-semibold">Kirim</button>
            </form>
          )}
        </div>
      </div>
      <p className="pb-8 text-center text-xs uppercase tracking-widest opacity-60">
        Easternstack Store — demo e-commerce
      </p>
    </footer>
  );
}
```

- [ ] **Step 3: Tulis layout (shop), product card, dan variant picker**

`app/(shop)/layout.tsx`:

```tsx
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Footer />
    </>
  );
}
```

`src/components/storefront/product-card.tsx`:

```tsx
import Link from "next/link";
import { formatIDR } from "@/lib/format";
import type { CatalogProduct } from "@/server/domain/catalog";

export function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <Link href={`/produk/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-card">
        {product.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
        )}
        <span className="absolute bottom-0 left-0 right-0 translate-y-full bg-white py-2 text-center text-xs font-semibold uppercase tracking-widest transition-transform group-hover:translate-y-0">
          Lihat Produk
        </span>
      </div>
      <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide">{product.name}</h3>
      <p className="text-sm">{formatIDR(product.basePrice)}</p>
      <div className="mt-1 flex gap-1">
        {product.colors.map((c) => (
          <span key={c.name} title={c.name} className="h-3 w-3 rounded-full border border-olive/20" style={{ background: c.hex }} />
        ))}
      </div>
    </Link>
  );
}
```

`src/components/variant-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { CatalogVariant } from "@/server/domain/catalog";
import { addToCartAction } from "@/server/actions/storefront";

type Props = { variants: CatalogVariant[]; images: string[]; slug: string };

function colorSlug(name: string) {
  return name.toLowerCase();
}

export function VariantPicker({ variants, images, slug }: Props) {
  const colors = [...new Map(variants.map((v) => [v.colorName, v.colorHex])).entries()];
  const sizes = [...new Set(variants.map((v) => v.size))];
  const [color, setColor] = useState(colors[0]?.[0] ?? "");
  const [size, setSize] = useState("");
  const selected = variants.find((v) => v.colorName === color && v.size === size);
  const gallery = images.filter((i) => i.includes(`-${colorSlug(color)}.`));
  const shown = gallery.length > 0 ? gallery : images;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex aspect-[4/5] max-w-md flex-col gap-2 bg-card">
        {shown.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={`${slug}`} className="h-full w-full object-cover" />
        ))}
      </div>
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
              className={`h-7 w-7 rounded-full border-2 ${color === name ? "border-olive" : "border-transparent"}`}
              style={{ background: hex }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest">Ukuran</p>
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
      {selected ? (
        <form action={addToCartAction} className="flex items-center gap-3">
          <input type="hidden" name="variantId" value={selected.id} />
          <input type="hidden" name="qty" value={1} />
          <button className="rounded-full border border-olive px-6 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime">
            Tambah ke Tas
          </button>
          <span className="text-sm">Stok: {selected.stock}</span>
        </form>
      ) : (
        <p className="text-sm opacity-70">Pilih warna dan ukuran terlebih dahulu.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Tulis halaman home, kategori, PDP, dan cari**

`app/(shop)/page.tsx`:

```tsx
import Link from "next/link";
import { ProductCard } from "@/components/storefront/product-card";
import { listCategories, listProducts } from "@/server/domain/catalog";

export default async function Home() {
  const [categories, pria, wanita] = await Promise.all([
    listCategories(),
    listProducts({ categorySlug: "pria" }),
    listProducts({ categorySlug: "wanita" }),
  ]);
  return (
    <div className="flex flex-col gap-14">
      <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <h1 className="text-5xl font-extrabold uppercase leading-[0.95] tracking-tight md:text-6xl">
          Melangkah ke Masa Depan Gaya
        </h1>
        <div className="flex flex-col justify-center gap-4">
          <p className="text-sm uppercase tracking-wide">
            Temukan gaya trendsetter untuk pria, wanita, dan anak — dari klasik hingga streetwear.
          </p>
          <Link
            href="/kategori/pria"
            className="inline-flex items-center justify-between rounded-full border border-olive px-5 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime"
          >
            Belanja Koleksi Baru <span>→</span>
          </Link>
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-bold">Favorit Minggu Ini</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {pria.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {categories.map((c) => (
          <Link key={c.id} href={`/kategori/${c.slug}`} className="bg-olive p-6 text-lime">
            <p className="text-sm font-bold uppercase tracking-widest">{c.name}</p>
          </Link>
        ))}
      </section>
      <section>
        <h2 className="text-2xl font-bold">Terbaru untuk Wanita</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {wanita.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <section className="bg-olive p-10 text-center text-lime">
        <p className="text-3xl font-extrabold uppercase tracking-tight">Gaya Hidup · Tas · Kacamata</p>
        <p className="mt-2 text-sm uppercase tracking-widest">Barang handcrafted untuk keseharian</p>
      </section>
    </div>
  );
}
```

`app/(shop)/kategori/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/storefront/product-card";
import { listCategories, listProducts } from "@/server/domain/catalog";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [categories, products] = await Promise.all([listCategories(), listProducts({ categorySlug: slug })]);
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();
  return (
    <div>
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">{category.name}</h1>
      <p className="mt-1 text-sm opacity-70">{products.length} produk</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
```

`app/(shop)/produk/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { VariantPicker } from "@/components/variant-picker";
import { formatIDR } from "@/lib/format";
import { getProductBySlug } from "@/server/domain/catalog";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <VariantPicker variants={product.variants} images={product.images} slug={product.slug} />
      <div>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">{product.name}</h1>
        <p className="mt-2 text-xl">{formatIDR(product.basePrice)}</p>
        <p className="mt-6 text-sm leading-relaxed">{product.description}</p>
      </div>
    </div>
  );
}
```

`app/(shop)/cari/page.tsx`:

```tsx
import { ProductCard } from "@/components/storefront/product-card";
import { listProducts } from "@/server/domain/catalog";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const products = await listProducts({ q: q ?? "" });
  return (
    <div>
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Hasil untuk “{q}”</h1>
      <p className="mt-1 text-sm opacity-70">{products.length} produk ditemukan</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Hapus placeholder lama dan verifikasi manual**

Run:
```bash
git rm app/page.tsx
npm run dev
```
Buka `http://localhost:3000`: home tampil dengan produk seed; klik kategori; buka PDP, pilih warna/ukuran, "Tambah ke Tas" (login dulu dengan `customer@demo.id / customer1234` bila di-redirect); badge cart bertambah; `/cari?q=tas` menampilkan hasil.
Expected: semua halaman render tanpa error console; add-to-cart redirect ke `/cart` (halaman cart Task 9 — untuk task ini cukup verifikasi redirect terjadi dan item tersimpan via Prisma Studio).

- [ ] **Step 6: Commit**

```bash
git add app src
git commit -m "feat: storefront shell, home, kategori, PDP, search + aksi cart"
```

---

### Task 9: Halaman cart + checkout + createOrder action

**Files:**
- Create: `app/(shop)/cart/page.tsx`, `app/(shop)/checkout/page.tsx`, `src/components/qty-stepper.tsx`
- Modify: `src/server/actions/storefront.ts` (tambah `createOrderAction`)

**Interfaces:**
- Consumes: `getCartView` (Task 6), `createOrderFromCart` (Task 7), `SHIPPING_FLAT_COST`, `formatIDR`, setCartQty/removeCartItem actions (Task 8)
- Produces: `createOrderAction(prev, formData): Promise<{error?: string} | null>` — redirect ke `/payment/<code>` saat sukses

- [ ] **Step 1: Tulis qty stepper dan halaman cart**

`src/components/qty-stepper.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { removeCartItemAction, setCartQtyAction } from "@/server/actions/storefront";

type Props = { variantId: string; qty: number; stock: number };

export function QtyStepper({ variantId, qty, stock }: Props) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        disabled={pending || qty <= 1}
        onClick={() => start(async () => await setCartQtyAction(variantId, qty - 1))}
        className="h-7 w-7 rounded-full border border-olive/25 disabled:opacity-40"
      >
        −
      </button>
      <span className="w-6 text-center">{qty}</span>
      <button
        disabled={pending || qty >= stock}
        onClick={() => start(async () => await setCartQtyAction(variantId, qty + 1))}
        className="h-7 w-7 rounded-full border border-olive/25 disabled:opacity-40"
      >
        +
      </button>
      <button
        disabled={pending}
        onClick={() => start(async () => await removeCartItemAction(variantId))}
        className="ml-2 underline"
      >
        Hapus
      </button>
    </div>
  );
}
```

`app/(shop)/cart/page.tsx`:

```tsx
import Link from "next/link";
import { QtyStepper } from "@/components/qty-stepper";
import { formatIDR } from "@/lib/format";
import { SHIPPING_FLAT_COST } from "@/lib/constants";
import { getCartView } from "@/server/domain/cart";
import { requireUser } from "@/server/session";

export default async function CartPage() {
  const session = await requireUser();
  const cart = await getCartView(session.userId);
  if (cart.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg">Keranjangmu masih kosong.</p>
        <Link href="/" className="mt-4 inline-block rounded-full border border-olive px-5 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime">
          Mulai Belanja
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        {cart.items.map((item) => (
          <div key={item.variantId} className="flex gap-4 border-b border-olive/10 pb-4">
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt={item.productName} className="h-24 w-20 object-cover bg-card" />
            )}
            <div className="flex-1">
              <Link href={`/produk/${item.slug}`} className="font-semibold uppercase tracking-wide text-sm">
                {item.productName}
              </Link>
              <p className="text-xs opacity-70">{item.variantLabel}</p>
              {!item.active && <p className="text-xs text-red-700">Produk sudah tidak aktif — silakan hapus.</p>}
              {item.qty > item.stock && <p className="text-xs text-red-700">Stok tersisa {item.stock}.</p>}
              <p className="mt-1 text-sm">{formatIDR(item.lineTotal)}</p>
            </div>
            <QtyStepper variantId={item.variantId} qty={item.qty} stock={item.stock} />
          </div>
        ))}
      </div>
      <aside className="h-fit rounded-2xl border border-olive/10 bg-white p-6">
        <h2 className="font-bold uppercase tracking-widest text-sm">Ringkasan</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatIDR(cart.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Ongkir</dt><dd>{formatIDR(SHIPPING_FLAT_COST)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatIDR(cart.subtotal + SHIPPING_FLAT_COST)}</dd></div>
        </dl>
        <Link href="/checkout" className="mt-4 block rounded-full bg-lime px-5 py-2 text-center text-sm font-semibold uppercase tracking-widest">
          Lanjut ke Checkout
        </Link>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Tambah createOrderAction dan halaman checkout**

Tambahkan di `src/server/actions/storefront.ts`:

```ts
import { createOrderFromCart, type AddressInput } from "@/server/domain/orders";

export type CheckoutState = { error?: string } | null;

export async function createOrderAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const session = await requireUser();
  const addressId = String(formData.get("addressId") ?? "");
  let address: AddressInput;
  if (addressId) {
    const saved = await prisma.address.findFirst({ where: { id: addressId, userId: session.userId } });
    if (!saved) return { error: "Alamat tidak ditemukan." };
    address = { recipient: saved.recipient, phone: saved.phone, line1: saved.line1, city: saved.city, province: saved.province, postalCode: saved.postalCode };
  } else {
    address = {
      recipient: String(formData.get("recipient") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      line1: String(formData.get("line1") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      province: String(formData.get("province") ?? "").trim(),
      postalCode: String(formData.get("postalCode") ?? "").trim(),
    };
    if (Object.values(address).some((v) => !v)) return { error: "Semua kolom alamat wajib diisi." };
    if (formData.get("saveAddress") === "on") {
      await prisma.address.create({ data: { ...address, userId: session.userId } });
    }
  }
  const result = await createOrderFromCart(session.userId, address);
  if ("error" in result) return { error: result.error };
  redirect(`/payment/${result.orderCode}`);
}
```

`app/(shop)/checkout/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { formatIDR } from "@/lib/format";
import { SHIPPING_FLAT_COST } from "@/lib/constants";
import { createOrderAction, type CheckoutState } from "@/server/actions/storefront";

type Props = {
  items: { variantId: string; productName: string; variantLabel: string; qty: number; lineTotal: number }[];
  subtotal: number;
  addresses: { id: string; recipient: string; line1: string; city: string }[];
};

export function CheckoutClient({ items, subtotal, addresses }: Props) {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(createOrderAction, null);
  return (
    <form action={formAction} className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">Checkout</h1>
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-olive/10 bg-white p-6">
          <legend className="px-2 text-sm font-bold uppercase tracking-widest">Alamat Pengiriman</legend>
          {addresses.length > 0 && (
            <select name="addressId" defaultValue="" className="rounded-full border border-olive/20 px-4 py-2 text-sm">
              <option value="">— Isi alamat baru —</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.recipient} — {a.line1}, {a.city}
                </option>
              ))}
            </select>
          )}
          <input name="recipient" placeholder="Nama penerima" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          <input name="phone" placeholder="No. handphone" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          <input name="line1" placeholder="Alamat (jalan, nomor, RT/RW)" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input name="city" placeholder="Kota" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
            <input name="province" placeholder="Provinsi" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
            <input name="postalCode" placeholder="Kode pos" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="saveAddress" /> Simpan alamat ini
          </label>
        </fieldset>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
      <aside className="h-fit rounded-2xl border border-olive/10 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest">Pesananmu</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.variantId} className="flex justify-between gap-2">
              <span>{i.productName} ({i.variantLabel}) × {i.qty}</span>
              <span>{formatIDR(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-olive/10 pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatIDR(subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Ongkir</dt><dd>{formatIDR(SHIPPING_FLAT_COST)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatIDR(subtotal + SHIPPING_FLAT_COST)}</dd></div>
        </dl>
        <button disabled={pending} className="mt-4 w-full rounded-full bg-lime px-5 py-2 text-sm font-semibold uppercase tracking-widest">
          {pending ? "Membuat pesanan…" : "Buat Pesanan"}
        </button>
      </aside>
    </form>
  );
}
```

dan wrapper server `app/(shop)/checkout/page.tsx` tidak bisa berisi dua export default — pisahkan: simpan komponen client di `src/components/checkout-client.tsx` (kode di atas, nama file disesuaikan), lalu:

`app/(shop)/checkout/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout-client";
import { getCartView } from "@/server/domain/cart";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";

export default async function CheckoutPage() {
  const session = await requireUser();
  const cart = await getCartView(session.userId);
  if (cart.items.length === 0) redirect("/cart");
  const addresses = await prisma.address.findMany({ where: { userId: session.userId } });
  return (
    <CheckoutClient
      items={cart.items.map((i) => ({
        variantId: i.variantId,
        productName: i.productName,
        variantLabel: i.variantLabel,
        qty: i.qty,
        lineTotal: i.lineTotal,
      }))}
      subtotal={cart.subtotal}
      addresses={addresses}
    />
  );
}
```

- [ ] **Step 3: Verifikasi manual checkout**

Run: `npm run dev`; login customer, isi cart, buka `/cart` (qty stepper berfungsi), `/checkout`, isi alamat, "Buat Pesanan".
Expected: redirect ke `/payment/ESV-…`; di Prisma Studio: Order PENDING dengan payment PENDING, stok varian berkurang, cart kosong.

- [ ] **Step 4: Commit**

```bash
git add app/\(shop\)/cart app/\(shop\)/checkout src/components/qty-stepper.tsx src/components/checkout-client.tsx src/server/actions/storefront.ts
git commit -m "feat: halaman cart & checkout + createOrder action"
```

---

### Task 10: Halaman mock payment gateway

**Files:**
- Create: `app/payment/[orderCode]/page.tsx`, `src/components/payment-gateway.tsx`
- Modify: `src/server/actions/storefront.ts` (tambah `confirmPaymentAction`)

**Interfaces:**
- Consumes: `confirmPayment` (Task 7), `getOrderForUser` (Task 7)
- Produces: alur bayar penuh: sukses → redirect `/akun/pesanan/<code>?baru=1`; decline → pesan inline + retry

- [ ] **Step 1: Tambah confirmPaymentAction**

Tambahkan di `src/server/actions/storefront.ts`:

```ts
import { confirmPayment } from "@/server/domain/payments/mock-gateway";
import type { CardInput, PaymentResult } from "@/server/domain/payments";

export async function confirmPaymentAction(orderCode: string, input: CardInput): Promise<PaymentResult> {
  const session = await getCurrentSession();
  if (!session) return { error: "Silakan masuk terlebih dahulu." };
  const order = await prisma.order.findFirst({ where: { code: orderCode, userId: session.userId } });
  if (!order) return { error: "Pesanan tidak ditemukan." };
  return confirmPayment(orderCode, input);
}
```

(impor `getCurrentSession` dari `@/server/session`.)

- [ ] **Step 2: Tulis komponen gateway dan halaman**

`src/components/payment-gateway.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";
import { confirmPaymentAction } from "@/server/actions/storefront";

type Props = { orderCode: string; total: number };

export function PaymentGateway({ orderCode, total }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "processing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      cardNumber: String(fd.get("cardNumber") ?? ""),
      expiry: String(fd.get("expiry") ?? ""),
      cvc: String(fd.get("cvc") ?? ""),
    };
    setPhase("processing");
    setError(null);
    await new Promise((r) => setTimeout(r, 2000));
    const result = await confirmPaymentAction(orderCode, input);
    if ("error" in result) {
      setPhase("error");
      setError(result.error);
      return;
    }
    router.push(`/akun/pesanan/${orderCode}?baru=1`);
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-olive/10 bg-white p-8">
      <p className="text-xs font-bold uppercase tracking-widest">MockPay — Gateway Tiruan</p>
      <h1 className="mt-1 text-2xl font-extrabold uppercase tracking-tight">Pembayaran</h1>
      <p className="mt-2 text-sm">
        Pesanan <span className="font-mono">{orderCode}</span> — tagihan{" "}
        <span className="font-bold">{formatIDR(total)}</span>
      </p>
      {phase === "processing" ? (
        <p className="mt-8 animate-pulse text-sm">Memproses pembayaran…</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <input name="cardNumber" required placeholder="Nomor kartu (16 digit)" className="rounded-full border border-olive/20 px-4 py-2 font-mono text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input name="expiry" required placeholder="MM/YY" className="rounded-full border border-olive/20 px-4 py-2 font-mono text-sm" />
            <input name="cvc" required placeholder="CVC" className="rounded-full border border-olive/20 px-4 py-2 font-mono text-sm" />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="rounded-full bg-lime px-5 py-2 text-sm font-semibold uppercase tracking-widest">
            Bayar Sekarang
          </button>
          <p className="text-xs opacity-70">
            Uji: `4242 4242 4242 4242` sukses · `4242 4242 4242 0002` ditolak · expiry `12/29`, CVC `123`
          </p>
        </form>
      )}
    </div>
  );
}
```

`app/payment/[orderCode]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { PaymentGateway } from "@/components/payment-gateway";
import { getOrderForUser } from "@/server/domain/orders";
import { requireUser } from "@/server/session";

export default async function PaymentPage({ params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const session = await requireUser();
  const order = await getOrderForUser(session.userId, orderCode);
  if (!order) redirect("/akun/pesanan");
  if (order.status !== "PENDING") redirect(`/akun/pesanan/${orderCode}`);
  return <PaymentGateway orderCode={order.code} total={order.total} />;
}
```

Catatan: halaman payment berada di luar group `(shop)` sehingga tanpa header — sengaja, agar terasa seperti halaman provider eksternal.

- [ ] **Step 3: Verifikasi manual dua jalur payment**

Run: `npm run dev`; buat pesanan baru; di `/payment/...` coba kartu `4242 4242 4242 0002` → pesan ditolak, order tetap PENDING, bisa retry; lalu `4242 4242 4242 4242` → spinner ±2 detik → redirect ke `/akun/pesanan/<code>?baru=1` (halaman detail Task 11; untuk task ini verifikasi via Studio: Payment SUCCESS, order PAID, OrderEvent PAID).
Expected: sesuai di atas; retry memakai Payment record yang sama (id tidak berubah).

- [ ] **Step 4: Commit**

```bash
git add app/payment src/components/payment-gateway.tsx src/server/actions/storefront.ts
git commit -m "feat: halaman mock payment gateway dengan decline deterministik"
```

---

### Task 11: Akun customer — daftar pesanan & detail tracking

**Files:**
- Create: `app/(shop)/akun/pesanan/page.tsx`, `app/(shop)/akun/pesanan/[orderCode]/page.tsx`, `src/components/storefront/status-chip.tsx`, `src/components/storefront/order-timeline.tsx`

**Interfaces:**
- Consumes: `listOrdersForUser`, `getOrderForUser` (Task 7), `formatIDR`
- Produces: `StatusChip({status})` dan `OrderTimeline({events})` dipakai juga admin (Task 13)

- [ ] **Step 1: Tulis StatusChip dan OrderTimeline**

`src/components/storefront/status-chip.tsx`:

```tsx
import type { OrderStatus } from "@prisma/client";

const LABELS: Record<OrderStatus, string> = {
  PENDING: "Menunggu Pembayaran",
  PAID: "Dibayar",
  PROCESSING: "Diproses",
  SHIPPED: "Dikirim",
  DELIVERED: "Selesai",
  CANCELLED: "Dibatalkan",
};

const TONES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  PAID: "bg-lime text-olive",
  PROCESSING: "bg-sky-100 text-sky-900",
  SHIPPED: "bg-violet-100 text-violet-900",
  DELIVERED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-red-100 text-red-900",
};

export function StatusChip({ status }: { status: OrderStatus }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONES[status]}`}>{LABELS[status]}</span>;
}
```

`src/components/storefront/order-timeline.tsx`:

```tsx
import type { OrderStatus } from "@prisma/client";

type EventView = { status: OrderStatus; note: string | null; createdAt: Date };

export function OrderTimeline({ events }: { events: EventView[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className={`mt-1 h-3 w-3 rounded-full ${i === events.length - 1 ? "bg-lime ring-2 ring-olive" : "bg-olive/30"}`} />
          <div>
            <p className="font-semibold">{e.status}</p>
            {e.note && <p className="text-xs opacity-70">{e.note}</p>}
            <p className="text-xs opacity-50">{new Date(e.createdAt).toLocaleString("id-ID")}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Tulis halaman daftar & detail pesanan**

`app/(shop)/akun/pesanan/page.tsx`:

```tsx
import Link from "next/link";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { listOrdersForUser } from "@/server/domain/orders";
import { requireUser } from "@/server/session";

export default async function MyOrdersPage() {
  const session = await requireUser();
  const orders = await listOrdersForUser(session.userId);
  return (
    <div>
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Pesanan Saya</h1>
      {orders.length === 0 ? (
        <p className="mt-6 text-sm">Belum ada pesanan.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.code}>
              <Link href={`/akun/pesanan/${o.code}`} className="flex items-center justify-between gap-4 rounded-2xl border border-olive/10 bg-white px-5 py-4">
                <div>
                  <p className="font-mono text-sm font-semibold">{o.code}</p>
                  <p className="text-xs opacity-70">
                    {new Date(o.createdAt).toLocaleDateString("id-ID")} · {o.itemCount} item
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusChip status={o.status} />
                  <span className="text-sm font-bold">{formatIDR(o.total)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`app/(shop)/akun/pesanan/[orderCode]/page.tsx`:

```tsx
import Link from "next/link";
import { OrderTimeline } from "@/components/storefront/order-timeline";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { getOrderForUser } from "@/server/domain/orders";
import { requireUser } from "@/server/session";

export default async function OrderDetailPage({ params, searchParams }: {
  params: Promise<{ orderCode: string }>;
  searchParams: Promise<{ baru?: string }>;
}) {
  const { orderCode } = await params;
  const { baru } = await searchParams;
  const session = await requireUser();
  const order = await getOrderForUser(session.userId, orderCode);
  if (!order) return <p className="text-sm">Pesanan tidak ditemukan.</p>;
  return (
    <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div>
        {baru === "1" && (
          <p className="mb-4 rounded-2xl bg-lime px-5 py-3 text-sm font-semibold">
            Pembayaran berhasil! Pesananmu sedang kami siapkan.
          </p>
        )}
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-2xl font-bold">{order.code}</h1>
          <StatusChip status={order.status} />
        </div>
        <ul className="mt-6 flex flex-col gap-2 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between border-b border-olive/10 pb-2">
              <span>{i.productName} — {i.variantLabel} × {i.qty}</span>
              <span>{formatIDR(i.unitPrice * i.qty)}</span>
            </li>
          ))}
        </ul>
        <h2 className="mt-8 text-sm font-bold uppercase tracking-widest">Pelacakan</h2>
        <div className="mt-3">
          <OrderTimeline events={order.events} />
        </div>
      </div>
      <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-olive/10 bg-white p-6 text-sm">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest">Alamat</h2>
          <p className="mt-1">{order.shipping.recipient} · {order.shipping.phone}</p>
          <p>{order.shipping.line1}, {order.shipping.city}, {order.shipping.province} {order.shipping.postalCode}</p>
        </div>
        {order.payment && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Pembayaran</h2>
            <p className="mt-1">{order.payment.method} · {order.payment.status}{order.payment.last4 ? ` · •••• ${order.payment.last4}` : ""}</p>
          </div>
        )}
        {order.shipment && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Pengiriman</h2>
            <p className="mt-1">{order.shipment.carrier} · Resi <span className="font-mono">{order.shipment.trackingNumber}</span></p>
          </div>
        )}
        <dl className="space-y-1 border-t border-olive/10 pt-3">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatIDR(order.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Ongkir</dt><dd>{formatIDR(order.shippingCost)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatIDR(order.total)}</dd></div>
        </dl>
        <Link href="/akun/pesanan" className="text-xs underline">← Semua pesanan</Link>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi manual**

Buka `/akun/pesanan` sebagai customer: daftar pesanan muncul; buka detail pesanan PAID: banner sukses (bila `?baru=1`), timeline PENDING→PAID, ringkasan alamat & payment benar.
Expected: sesuai; pesanan user lain tidak terlihat (coba code pesanan user lain → "Pesanan tidak ditemukan.").

- [ ] **Step 4: Commit**

```bash
git add app/\(shop\)/akun src/components/storefront/status-chip.tsx src/components/storefront/order-timeline.tsx
git commit -m "feat: akun customer — daftar pesanan & timeline tracking"
```

---

### Task 12: Admin — guard, katalog produk, editor matriks varian, upload

**Files:**
- Create: `src/server/domain/admin-catalog.ts`, `src/server/actions/admin.ts`, `app/admin/layout.tsx`, `app/admin/produk/page.tsx`, `app/admin/produk/baru/page.tsx`, `app/admin/produk/[id]/edit/page.tsx`, `src/components/admin/product-form.tsx`, `app/uploads/[...path]/route.ts`, `tests/integration/admin-catalog.test.ts`

**Interfaces:**
- Consumes: `assertRole`/`Session` (Task 3), `prisma`
- Produces: `saveProduct(input: ProductInput, actor): Promise<{ok:true; id:string}|{error:string}>`; `toggleProductActive(productId, actor): Promise<Result>`; `listProductsForAdmin(actor): Promise<AdminProductRow[]>`; `getProductForEdit(id, actor): Promise<ProductEdit|null>`; Server Actions `saveProductAction(formData)`, `toggleProductActiveAction(productId)`; type `AdminProductRow = { id, name, slug, categoryName, basePrice, totalStock, isActive }`, `ProductEdit = { id, name, slug, categoryId, description, basePrice, images: string[], variants: { id, colorName, colorHex, size, stock, sold: boolean }[] }`

- [ ] **Step 1: Tulis test integration gagal untuk admin-catalog**

`tests/integration/admin-catalog.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { saveProduct, toggleProductActive, type ProductInput } from "@/server/domain/admin-catalog";
import { addToCart } from "@/server/domain/cart";
import { createOrderFromCart } from "@/server/domain/orders";
import type { Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

const admin: Session = { userId: "admin-test", role: "ADMIN" };
const customer: Session = { userId: "cust-test", role: "CUSTOMER" };

beforeEach(cleanDb);

function input(categoryId: string, over: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Jaket Uji",
    slug: "jaket-uji",
    categoryId,
    description: "Uji",
    basePrice: 100000,
    images: [],
    variants: [
      { colorName: "Hitam", colorHex: "#111", size: "M", stock: 4 },
      { colorName: "Hitam", colorHex: "#111", size: "L", stock: 2 },
    ],
    ...over,
  };
}

describe("admin-catalog", () => {
  it("menolak aktor non-admin", async () => {
    const cat = await makeCategory();
    await expect(saveProduct(input(cat.id), customer)).resolves.toEqual({ error: "FORBIDDEN" });
    const product = await makeProduct(cat.id);
    await expect(toggleProductActive(product.id, customer)).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("membuat produk beserta varian matriks", async () => {
    const cat = await makeCategory();
    const result = await saveProduct(input(cat.id), admin);
    expect(result).toMatchObject({ ok: true });
    const id = (result as { ok: true; id: string }).id;
    const product = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
    expect(product?.variants).toHaveLength(2);
    expect(product?.slug).toBe("jaket-uji");
  });

  it("slug duplikat mendapat suffix otomatis", async () => {
    const cat = await makeCategory();
    await saveProduct(input(cat.id), admin);
    const second = await saveProduct(input(cat.id), admin);
    const id = (second as { ok: true; id: string }).id;
    const product = await prisma.product.findUnique({ where: { id } });
    expect(product?.slug).not.toBe("jaket-uji");
  });

  it("update stok varian existing", async () => {
    const cat = await makeCategory();
    const { id } = (await saveProduct(input(cat.id), admin)) as { ok: true; id: string };
    const before = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
    const v = before!.variants[0];
    await saveProduct(
      input(cat.id, {
        id,
        variants: [
          { id: v.id, colorName: v.colorName, colorHex: v.colorHex, size: v.size, stock: 9 },
          { id: before!.variants[1].id, colorName: "Hitam", colorHex: "#111", size: "L", stock: 2 },
        ],
      }),
      admin,
    );
    const after = await prisma.productVariant.findUnique({ where: { id: v.id } });
    expect(after?.stock).toBe(9);
  });

  it("menolak menghapus varian yang sudah terjual", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 5 });
    await addToCart(user.id, product.variants[0].id, 1);
    await createOrderFromCart(user.id, {
      recipient: "A", phone: "0812", line1: "Jl", city: "B", province: "C", postalCode: "12345",
    });
    const kept = product.variants[1];
    const result = await saveProduct(
      {
        id: product.id,
        name: product.name,
        slug: product.slug,
        categoryId: cat.id,
        description: product.description,
        basePrice: product.basePrice,
        images: product.images,
        variants: [{ id: kept.id, colorName: kept.colorName, colorHex: kept.colorHex, size: kept.size, stock: kept.stock }],
      },
      admin,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("terjual") });
  });

  it("toggleProductActive mengubah isActive", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    await toggleProductActive(product.id, admin);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/integration/admin-catalog.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasikan admin-catalog.ts**

`src/server/domain/admin-catalog.ts`:

```ts
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
    include: { variants: true, orderItems: { select: { id: true } } },
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
```

Catatan: relasi `product.orderItems` tidak ada di skema — **hapus** `orderItems` dari include `getProductForEdit` (data sold tetap dari query `orderItem.findMany` di bawahnya).

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/integration/admin-catalog.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Tulis Server Actions admin + route upload**

`src/server/actions/admin.ts`:

```ts
"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { adminTransition } from "@/server/domain/orders";
import { saveProduct, toggleProductActive, type ProductInput, type VariantInput } from "@/server/domain/admin-catalog";
import type { OrderStatus } from "@prisma/client";

const UPLOAD_DIR = path.resolve(process.cwd(), "var/uploads");
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp"];

type MatrixJson = { colors: { name: string; hex: string }[]; sizes: string[]; cells: Record<string, number> };

export async function saveProductAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const session = await getCurrentSession();
  const matrix = JSON.parse(String(formData.get("matrix") ?? "{}")) as MatrixJson;
  const variants: VariantInput[] = [];
  for (const [key, stock] of Object.entries(matrix.cells)) {
    const [colorName, size] = key.split("::");
    const color = matrix.colors.find((c) => c.name === colorName);
    if (!color) continue;
    const existingId = String(formData.get(`vid::${key}`) ?? "") || undefined;
    variants.push({ id: existingId, colorName, colorHex: color.hex, size, stock });
  }
  const images: string[] = [];
  for (const value of formData.getAll("existingImage")) images.push(String(value));
  for (const [index, value] of [...formData.entries()].filter(([k]) => k.startsWith("removeImage::"))) {
    void index;
    void value;
  }
  const removed = new Set(
    formData.getAll("removeImage").map((v) => String(v)),
  );
  const keptImages = images.filter((i) => !removed.has(i));

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  await mkdir(UPLOAD_DIR, { recursive: true });
  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return { error: `Format gambar tidak didukung: ${file.name}` };
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, safe), buffer);
    keptImages.push(`/uploads/${safe}`);
  }

  const input: ProductInput = {
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    description: String(formData.get("description") ?? ""),
    basePrice: Number(formData.get("basePrice") ?? 0),
    images: keptImages,
    variants,
  };
  const result = await saveProduct(input, session);
  if ("error" in result) return result;
  revalidatePath("/admin/produk");
  redirect(`/admin/produk/${result.id}/edit`);
}

export async function toggleProductActiveAction(productId: string): Promise<{ ok: true } | { error: string }> {
  const session = await getCurrentSession();
  const result = await toggleProductActive(productId, session);
  if ("error" in result) return result;
  revalidatePath("/admin/produk");
  return { ok: true };
}

export async function adminOrderTransitionAction(orderCode: string, to: OrderStatus): Promise<{ ok: true } | { error: string }> {
  const session = await getCurrentSession();
  const result = await adminTransition(orderCode, to, session);
  if ("error" in result) return result;
  revalidatePath("/admin/pesanan");
  revalidatePath(`/admin/pesanan/${orderCode}`);
  return { ok: true };
}
```

Catatan: blok loop `[...formData.entries()].filter(...)` untuk `removeImage::` tidak dipakai — **hapus** blok tersebut; mekanisme remove cukup `formData.getAll("removeImage")` berisi path gambar yang dicentang.

`app/uploads/[...path]/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const UPLOAD_DIR = path.resolve(process.cwd(), "var/uploads");

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const resolved = path.resolve(UPLOAD_DIR, ...segments);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const body = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
```

- [ ] **Step 6: Tulis layout admin + halaman katalog + form produk**

`app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl gap-8 px-4 py-8">
      <aside className="w-48 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest opacity-60">Admin</p>
        <nav className="mt-2 flex flex-col gap-2 text-sm font-semibold">
          <Link href="/admin/produk" className="rounded-full px-3 py-1 hover:bg-lime">Produk & Stok</Link>
          <Link href="/admin/pesanan" className="rounded-full px-3 py-1 hover:bg-lime">Pesanan</Link>
          <Link href="/" className="rounded-full px-3 py-1 opacity-60 hover:bg-lime">← Toko</Link>
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

`app/admin/produk/page.tsx`:

```tsx
import Link from "next/link";
import { formatIDR } from "@/lib/format";
import { listProductsForAdmin } from "@/server/domain/admin-catalog";
import { requireAdmin } from "@/server/session";
import { ToggleActiveButton } from "@/components/admin/toggle-active-button";

export default async function AdminProductsPage() {
  const session = await requireAdmin();
  const rows = await listProductsForAdmin(session);
  if ("error" in rows) return <p>{rows.error}</p>;
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Produk & Stok</h1>
        <Link href="/admin/produk/baru" className="rounded-full bg-lime px-4 py-2 text-sm font-semibold uppercase tracking-widest">
          Produk Baru
        </Link>
      </div>
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
              <td className="flex gap-2 py-2">
                <Link href={`/admin/produk/${r.id}/edit`} className="underline">Edit</Link>
                <ToggleActiveButton productId={r.id} isActive={r.isActive} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/admin/toggle-active-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toggleProductActiveAction } from "@/server/actions/admin";

export function ToggleActiveButton({ productId, isActive }: { productId: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => await toggleProductActiveAction(productId))}
      className="underline opacity-70"
    >
      {isActive ? "Nonaktifkan" : "Aktifkan"}
    </button>
  );
}
```

`src/components/admin/product-form.tsx` (client; editor matriks varian):

```tsx
"use client";

import { useState } from "react";
import { saveProductAction } from "@/server/actions/admin";

type VariantEdit = { id?: string; colorName: string; colorHex: string; size: string; stock: number; sold?: boolean };
type Props = {
  initial?: { id: string; name: string; slug: string; categoryId: string; description: string; basePrice: number; images: string[]; variants: VariantEdit[] };
  categories: { id: string; name: string }[];
};

export function ProductForm({ initial, categories }: Props) {
  const [colors, setColors] = useState<{ name: string; hex: string }[]>(
    [...new Map((initial?.variants ?? []).map((v) => [v.colorName, v.colorHex]))].map(([name, hex]) => ({ name, hex })),
  );
  const [sizes, setSizes] = useState<string[]>([...new Set((initial?.variants ?? []).map((v) => v.size))]);
  const [cells, setCells] = useState<Record<string, number>>(
    Object.fromEntries((initial?.variants ?? []).map((v) => [`${v.colorName}::${v.size}`, v.stock])),
  );
  const [variantIds] = useState<Record<string, string>>(
    Object.fromEntries((initial?.variants ?? []).filter((v) => v.id).map((v) => [`${v.colorName}::${v.size}`, v.id!])),
  );
  const [sold] = useState<Set<string>>(
    new Set((initial?.variants ?? []).filter((v) => v.sold).map((v) => `${v.colorName}::${v.size}`)),
  );
  const [newColor, setNewColor] = useState({ name: "", hex: "#1c1c1c" });
  const [newSize, setNewSize] = useState("");
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const matrix = {
    colors,
    sizes,
    cells: Object.fromEntries(Object.entries(cells).filter(([k]) => {
      const [c, s] = k.split("::");
      return colors.some((x) => x.name === c) && sizes.includes(s);
    })),
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("matrix", JSON.stringify(matrix));
    const result = await saveProductAction(fd);
    if ("error" in result) setError(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <div className="grid gap-3 md:grid-cols-2">
        <input name="name" required defaultValue={initial?.name} placeholder="Nama produk"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm" />
        <input name="slug" defaultValue={initial?.slug} placeholder="slug (opsional, auto dari nama)"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm" />
        <select name="categoryId" defaultValue={initial?.categoryId} required
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm">
          <option value="" disabled>Pilih kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input name="basePrice" type="number" min={1} required defaultValue={initial?.basePrice} placeholder="Harga (rupiah)"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm" />
      </div>
      <textarea name="description" defaultValue={initial?.description} placeholder="Deskripsi"
        className="min-h-24 rounded-2xl border border-olive/20 bg-white px-4 py-2 text-sm" />

      <fieldset className="rounded-2xl border border-olive/10 bg-white p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-widest">Gambar</legend>
        <ul className="flex flex-wrap gap-3 text-xs">
          {(initial?.images ?? []).filter((i) => !removedImages.includes(i)).map((img) => (
            <li key={img} className="flex items-center gap-2">
              <input type="hidden" name="existingImage" value={img} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" className="h-14 w-12 object-cover bg-card" />
              <label className="flex items-center gap-1">
                <input type="checkbox" name="removeImage" value={img}
                  onChange={(e) => setRemovedImages((r) => e.target.checked ? [...r, img] : r.filter((x) => x !== img))} />
                hapus
              </label>
            </li>
          ))}
        </ul>
        <input type="file" name="files" accept=".jpg,.jpeg,.png,.webp" multiple className="mt-2 text-xs" />
      </fieldset>

      <fieldset className="rounded-2xl border border-olive/10 bg-white p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-widest">Matriks Varian (warna × ukuran → stok)</legend>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1">Warna baru
            <input value={newColor.name} onChange={(e) => setNewColor({ ...newColor, name: e.target.value })} placeholder="mis. Sage"
              className="rounded-full border border-olive/20 px-3 py-1" />
          </label>
          <label className="flex flex-col gap-1">Hex
            <input type="color" value={newColor.hex} onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })} />
          </label>
          <button type="button" className="rounded-full border border-olive px-3 py-1"
            onClick={() => {
              if (!newColor.name.trim()) return;
              setColors((c) => [...c, { name: newColor.name.trim(), hex: newColor.hex }]);
              setNewColor({ name: "", hex: "#1c1c1c" });
            }}>
            + Warna
          </button>
          <label className="flex flex-col gap-1">Ukuran baru
            <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="mis. XL"
              className="rounded-full border border-olive/20 px-3 py-1" />
          </label>
          <button type="button" className="rounded-full border border-olive px-3 py-1"
            onClick={() => {
              if (!newSize.trim()) return;
              setSizes((s) => [...s, newSize.trim()]);
              setNewSize("");
            }}>
            + Ukuran
          </button>
        </div>
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left">Warna</th>
              {sizes.map((s) => (
                <th key={s} className="p-1">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c.name}>
                <td className="p-1">
                  <span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: c.hex }} />
                  {c.name}
                </td>
                {sizes.map((s) => {
                  const key = `${c.name}::${s}`;
                  return (
                    <td key={key} className="p-1 text-center">
                      <input
                        type="number"
                        min={0}
                        value={cells[key] ?? ""}
                        placeholder="—"
                        onChange={(e) => setCells((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="w-16 rounded-full border border-olive/20 px-2 py-1 text-center"
                      />
                      {variantIds[key] && <input type="hidden" name={`vid::${key}`} value={variantIds[key]} />}
                      {sold.has(key) && <p className="text-[10px] opacity-60">terjual</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] opacity-60">Sel kosong = varian tidak dibuat. Varian bertanda "terjual" tidak bisa dihapus (kosongkan stoknya menjadi 0 bila perlu).</p>
      </fieldset>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="w-fit rounded-full bg-lime px-6 py-2 text-sm font-semibold uppercase tracking-widest">Simpan Produk</button>
    </form>
  );
}
```

`app/admin/produk/baru/page.tsx`:

```tsx
import { ProductForm } from "@/components/admin/product-form";
import { listCategories } from "@/server/domain/catalog";

export default async function NewProductPage() {
  const categories = await listCategories();
  return (
    <div>
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Produk Baru</h1>
      <div className="mt-6">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
```

`app/admin/produk/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { listCategories } from "@/server/domain/catalog";
import { getProductForEdit } from "@/server/domain/admin-catalog";
import { requireAdmin } from "@/server/session";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAdmin();
  const [product, categories] = await Promise.all([getProductForEdit(id, session), listCategories()]);
  if (!product || "error" in product) notFound();
  return (
    <div>
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Edit: {product.name}</h1>
      <div className="mt-6">
        <ProductForm initial={product} categories={categories} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verifikasi manual admin produk**

Login `admin@demo.id / admin1234`; `/admin/produk`: tabel 12 produk seed; buka edit salah satu: matriks terisi; ubah stok satu sel → simpan → stok berubah (cek Studio); buat produk baru dengan 2 warna × 2 ukuran + upload 1 gambar → gambar tampil via `/uploads/...`; nonaktifkan produk → hilang dari storefront.
Expected: semua perilaku di atas; akses `/admin` sebagai customer → redirect ke `/`.

- [ ] **Step 8: Commit**

```bash
git add src/server/domain/admin-catalog.ts src/server/actions/admin.ts app/admin app/uploads src/components/admin tests/integration/admin-catalog.test.ts
git commit -m "feat: admin katalog produk + editor matriks varian + upload gambar"
```

---

### Task 13: Admin — manajemen pesanan & transisi status

**Files:**
- Create: `app/admin/pesanan/page.tsx`, `app/admin/pesanan/[orderCode]/page.tsx`, `src/components/admin/transition-buttons.tsx`

**Interfaces:**
- Consumes: `listOrdersForAdmin`, `getOrderForAdmin`, `allowedTargets` (Task 2), `adminOrderTransitionAction` (Task 12), `StatusChip`/`OrderTimeline` (Task 11)

- [ ] **Step 1: Tulis transition buttons client**

`src/components/admin/transition-buttons.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import type { OrderStatus } from "@prisma/client";
import { adminOrderTransitionAction } from "@/server/actions/admin";

const LABELS: Partial<Record<OrderStatus, string>> = {
  PROCESSING: "Mulai Proses",
  SHIPPED: "Kirim Paket",
  DELIVERED: "Tandai Diterima",
  CANCELLED: "Batalkan Pesanan",
};

export function TransitionButtons({ orderCode, targets }: { orderCode: string; targets: OrderStatus[] }) {
  const [pending, start] = useTransition();
  const actionable = targets.filter((t) => t !== "PAID");
  if (actionable.length === 0) return <p className="text-xs opacity-60">Tidak ada aksi tersedia.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {actionable.map((t) => (
        <button
          key={t}
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Ubah status pesanan menjadi ${t}?`)) return;
            start(async () => await adminOrderTransitionAction(orderCode, t));
          }}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest ${
            t === "CANCELLED" ? "border border-red-700 text-red-700" : "bg-lime"
          }`}
        >
          {LABELS[t] ?? t}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Tulis halaman daftar & detail pesanan admin**

`app/admin/pesanan/page.tsx`:

```tsx
import Link from "next/link";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { listOrdersForAdmin } from "@/server/domain/orders";
import { requireAdmin } from "@/server/session";
import type { OrderStatus } from "@prisma/client";

const TABS: (OrderStatus | undefined)[] = [undefined, "PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  await requireAdmin();
  const filter = TABS.includes(status as OrderStatus | undefined) ? (status as OrderStatus) : undefined;
  const orders = await listOrdersForAdmin(filter);
  return (
    <div>
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Pesanan</h1>
      <nav className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-widest">
        {TABS.map((t) => (
          <Link key={t ?? "all"} href={t ? `/admin/pesanan?status=${t}` : "/admin/pesanan"}
            className={`rounded-full px-3 py-1 ${filter === t ? "bg-olive text-lime" : "border border-olive/20"}`}>
            {t ?? "Semua"}
          </Link>
        ))}
      </nav>
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
          {orders.map((o) => (
            <tr key={o.code} className="border-b border-olive/10">
              <td className="py-2">
                <Link href={`/admin/pesanan/${o.code}`} className="font-mono font-semibold underline">{o.code}</Link>
              </td>
              <td>{o.customerName}</td>
              <td>{new Date(o.createdAt).toLocaleDateString("id-ID")}</td>
              <td>{formatIDR(o.total)}</td>
              <td><StatusChip status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`app/admin/pesanan/[orderCode]/page.tsx`:

```tsx
import Link from "next/link";
import { TransitionButtons } from "@/components/admin/transition-buttons";
import { OrderTimeline } from "@/components/storefront/order-timeline";
import { StatusChip } from "@/components/storefront/status-chip";
import { formatIDR } from "@/lib/format";
import { allowedTargets } from "@/lib/order-status";
import { getOrderForAdmin } from "@/server/domain/orders";
import { requireAdmin } from "@/server/session";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  await requireAdmin();
  const order = await getOrderForAdmin(orderCode);
  if (!order) return <p className="text-sm">Pesanan tidak ditemukan.</p>;
  return (
    <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div>
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-2xl font-bold">{order.code}</h1>
          <StatusChip status={order.status} />
        </div>
        <ul className="mt-6 flex flex-col gap-2 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between border-b border-olive/10 pb-2">
              <span>{i.productName} — {i.variantLabel} × {i.qty}</span>
              <span>{formatIDR(i.unitPrice * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <TransitionButtons orderCode={order.code} targets={allowedTargets(order.status)} />
        </div>
        <h2 className="mt-8 text-sm font-bold uppercase tracking-widest">Timeline</h2>
        <div className="mt-3">
          <OrderTimeline events={order.events} />
        </div>
      </div>
      <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-olive/10 bg-white p-6 text-sm">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest">Alamat Tujuan</h2>
          <p className="mt-1">{order.shipping.recipient} · {order.shipping.phone}</p>
          <p>{order.shipping.line1}, {order.shipping.city}, {order.shipping.province} {order.shipping.postalCode}</p>
        </div>
        {order.payment && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Pembayaran</h2>
            <p className="mt-1">{order.payment.method} · {order.payment.status}{order.payment.last4 ? ` · •••• ${order.payment.last4}` : ""}</p>
          </div>
        )}
        {order.shipment && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Pengiriman</h2>
            <p className="mt-1">{order.shipment.carrier} · Resi <span className="font-mono">{order.shipment.trackingNumber}</span></p>
          </div>
        )}
        <Link href="/admin/pesanan" className="text-xs underline">← Semua pesanan</Link>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi manual loop admin pesanan**

Sebagai admin: buka pesanan PAID → "Mulai Proses" → "Kirim Paket" (resi MKX-###### muncul) → "Tandai Diterima"; buat pesanan PENDING lain → "Batalkan Pesanan" → stok varian kembali (cek Studio / halaman produk). Tombol hanya menampilkan transisi valid (mis. DELIVERED tanpa tombol).
Expected: sesuai; sebagai customer mengakses `/admin/pesanan` → redirect `/`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/pesanan src/components/admin/transition-buttons.tsx
git commit -m "feat: admin order management dengan transisi status terjaga"
```

---

### Task 14: Verifikasi end-to-end + pembersihan + commit final

**Files:** tidak ada file baru; perbaikan kecil bila ditemukan

- [ ] **Step 1: Jalankan seluruh suite test**

Run: `npx vitest run`
Expected: PASS semua test unit & integration.

- [ ] **Step 2: Jalankan production build**

Run: `npm run build`
Expected: build sukses tanpa error type/lint blocking.

- [ ] **Step 3: Golden path manual (browser)**

Checklist (jalankan berurutan, catat temuan):
1. `npm run db:up && npm run db:migrate && npm run db:seed && npm run dev`
2. Register customer baru → login otomatis.
3. Home → kategori → PDP: pilih warna/ukuran, tambah ke tas.
4. Cart: ubah qty, hapus satu item.
5. Checkout: isi alamat + centang simpan → buat pesanan → halaman MockPay.
6. Bayar dengan kartu decline `…0002` → pesan gagal, retry dengan `…4242` → sukses → halaman detail pesanan dengan banner + timeline PAID.
7. Logout → login `admin@demo.id` → admin pesanan: Proses → Kirim (resi muncul) → Tandai Diterima; cek timeline customer bertambah.
8. Admin produk: edit stok, buat produk baru dengan upload gambar, nonaktifkan satu produk → hilang dari storefront & search.
9. Batalkan satu pesanan PAID dari admin → stok restore terlihat di form edit produk.
Expected: semua langkah lolos tanpa error console.

- [ ] **Step 4: Perbaiki temuan kecil bila ada, jalankan ulang test, commit**

```bash
git add -A
git commit -m "chore: verifikasi e2e demo + perbaikan kecil"
```

---

## Self-Review (hasil pemeriksaan penulis plan terhadap spec)

- **Cakupan spec → task**: storefront & desain (T8), akun auth (T3), katalog/varian/stok (T4, T6, T12), checkout + stok transaksional (T7, T9), mock payment + decline + retry record sama (T7, T10), pipeline status + resi + timeline (T7, T11, T13), admin guard ganda (T3 via requireAdmin, T12, T13), snapshot order (T7 createOrder), upload var/uploads + route (T12), seed + gambar (T5), env/docker/scripts (T1), testing Vitest titik kritis (T2, T4, T6, T7, T12), copy Indonesia & IDR (Global Constraints + semua UI), cancel hanya admin (T7 adminTransition + UI T13 tanpa aksi cancel customer).
- **Placeholder**: tidak ada langkah "TBD/TODO"; setiap langkah kode memuat kode lengkap; catatan "hapus baris X" adalah koreksi eksplisit terhadap draf di langkah yang sama, bukan placeholder.
- **Konsistensi tipe/nama**: `Result`, `CardInput`, `CatalogVariant`, `OrderSummary/OrderDetail`, `saveProduct/saveProductAction`, `adminOrderTransitionAction`, `StatusChip/OrderTimeline` konsisten antar task; signature `params: Promise<...>` sesuai Next 15.
- **Catatan implementasi yang wajib ditaati executor**: (1) `mock-gateway.ts` tidak meng-import `orders.ts` (transisi PAID ditulis inline dalam transaksi); (2) `orders.ts` tidak meng-import `Prisma` maupun `clearCart`; (3) `getProductForEdit` tidak include relasi `orderItems` di Product; (4) `saveProductAction` tidak memakai loop `removeImage::`; (5) komponen checkout client berada di `src/components/checkout-client.tsx`, bukan dobel export default di page.

