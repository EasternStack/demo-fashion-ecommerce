import { describe, expect, it, vi } from "vitest";
import { evaluateAccess } from "@/server/session";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: () => {},
    get: () => undefined,
    delete: () => {},
  }),
}));

const ACTIVE_ADMIN = { role: "ADMIN" as const, suspendedAt: null };
const ACTIVE_CUSTOMER = { role: "CUSTOMER" as const, suspendedAt: null };
const SUSPENDED = { role: "CUSTOMER" as const, suspendedAt: new Date("2026-09-01T00:00:00Z") };

describe("evaluateAccess", () => {
  it("mengizinkan user apa pun bila tidak ada role yang dipersyaratkan", () => {
    expect(evaluateAccess(ACTIVE_ADMIN)).toEqual({ ok: true });
    expect(evaluateAccess(ACTIVE_CUSTOMER)).toEqual({ ok: true });
  });

  it("mengizinkan role yang cocok dan tidak suspended", () => {
    expect(evaluateAccess(ACTIVE_ADMIN, "ADMIN")).toEqual({ ok: true });
    expect(evaluateAccess(ACTIVE_CUSTOMER, "CUSTOMER")).toEqual({ ok: true });
  });

  it("menolak tanpa user sebagai NO_SESSION", () => {
    expect(evaluateAccess(null)).toEqual({ reason: "NO_SESSION" });
    expect(evaluateAccess(null, "ADMIN")).toEqual({ reason: "NO_SESSION" });
  });

  it("menolak akun suspended sebelum memeriksa role", () => {
    expect(evaluateAccess(SUSPENDED)).toEqual({ reason: "SUSPENDED" });
    expect(evaluateAccess({ role: "ADMIN", suspendedAt: new Date() }, "ADMIN")).toEqual({
      reason: "SUSPENDED",
    });
  });

  it("menolak role tidak cocok sebagai FORBIDDEN", () => {
    expect(evaluateAccess(ACTIVE_CUSTOMER, "ADMIN")).toEqual({ reason: "FORBIDDEN" });
  });
});
