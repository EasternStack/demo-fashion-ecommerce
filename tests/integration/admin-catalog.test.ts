import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { saveProduct, toggleProductActive, listProductsForAdmin, type ProductInput } from "@/server/domain/admin-catalog";
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
    const product = await makeProduct(cat.id, { stock: 5, sizes: ["M", "L"] });
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
});
