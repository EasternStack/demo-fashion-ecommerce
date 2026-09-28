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
