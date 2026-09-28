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
    expect(detail?.sizes).toEqual(["M", "S"]);
    await expect(getProductBySlug("tidak-ada")).resolves.toBeNull();
  });
});
