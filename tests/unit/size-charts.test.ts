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
