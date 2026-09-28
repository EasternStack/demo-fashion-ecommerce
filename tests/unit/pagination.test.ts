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
