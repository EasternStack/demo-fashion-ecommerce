"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { hashPassword, loginSession, logoutSession, verifyPassword } from "@/server/session";

export type AuthState = { error?: string } | null;

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || password.length < 8) {
    return { error: "Nama, email, dan password minimal 8 karakter wajib diisi." };
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Email sudah terdaftar." };
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });
  await loginSession(user.id, user.role);
  redirect("/");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Email atau password salah." };
  }
  if (user.suspendedAt) {
    return { error: "Akun ditangguhkan." };
  }
  await loginSession(user.id, user.role);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction(): Promise<void> {
  await logoutSession();
  redirect("/");
}
