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
