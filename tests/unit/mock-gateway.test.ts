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
