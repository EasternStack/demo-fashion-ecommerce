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
