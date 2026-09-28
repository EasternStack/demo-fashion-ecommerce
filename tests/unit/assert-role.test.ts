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
