import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";
import { getCurrentSession, loginSession, logoutSession } from "@/server/session";

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string) => void jar.set(name, value),
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    delete: (name: string) => void jar.delete(name),
  }),
}));

function key() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

describe("session cookie", () => {
  beforeEach(() => jar.clear());

  it("loginSession menulis JWT yang terbaca kembali sebagai session", async () => {
    await loginSession("u1", "ADMIN");

    const token = jar.get("esv_session");
    expect(token).toBeDefined();

    const { payload, protectedHeader } = await jwtVerify(token!, key());
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe("u1");
    expect(payload.role).toBe("ADMIN");
    await expect(getCurrentSession()).resolves.toEqual({ userId: "u1", role: "ADMIN" });
  });

  it("logoutSession menghapus session", async () => {
    await loginSession("u2", "CUSTOMER");
    await logoutSession();

    await expect(getCurrentSession()).resolves.toBeNull();
  });
});
