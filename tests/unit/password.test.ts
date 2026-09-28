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
