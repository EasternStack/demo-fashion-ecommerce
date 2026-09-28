import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/server/db";

const scrypt = promisify(scryptCb);

export type Role = "CUSTOMER" | "ADMIN";
export type Session = { userId: string; role: Role };

export type AdminSession = Session & { name: string; email: string };

export type AccessDenied = { reason: "NO_SESSION" | "SUSPENDED" | "FORBIDDEN" };

export function evaluateAccess(
  user: { role: Role; suspendedAt: Date | null } | null,
  required?: Role,
): { ok: true } | AccessDenied {
  if (!user) return { reason: "NO_SESSION" };
  if (user.suspendedAt) return { reason: "SUSPENDED" };
  if (required && user.role !== required) return { reason: "FORBIDDEN" };
  return { ok: true };
}

type LoadedUser = { role: Role; suspendedAt: Date | null; name: string; email: string };

async function loadSessionUser(): Promise<{ session: Session; user: LoadedUser } | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, suspendedAt: true, name: true, email: true },
  });
  if (!user) return null;
  return { session: { userId: session.userId, role: user.role }, user };
}

const COOKIE_NAME = "esv_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET belum diset");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(plain, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const candidate = (await scrypt(plain, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function assertRole(session: Session | null, role: Role): Session {
  if (!session || session.role !== role) throw new Error("FORBIDDEN");
  return session;
}

export async function loginSession(userId: string, role: Role): Promise<void> {
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function logoutSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getCurrentSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { userId: payload.sub as string, role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<Session> {
  const loaded = await loadSessionUser();
  const access = evaluateAccess(loaded?.user ?? null);
  if ("ok" in access) return loaded!.session;
  redirect("/login");
}

export async function requireAdmin(): Promise<AdminSession> {
  const loaded = await loadSessionUser();
  const access = evaluateAccess(loaded?.user ?? null, "ADMIN");
  if ("ok" in access) {
    return { ...loaded!.session, name: loaded!.user.name, email: loaded!.user.email };
  }
  redirect(access.reason === "FORBIDDEN" ? "/" : "/login?next=/admin");
}
