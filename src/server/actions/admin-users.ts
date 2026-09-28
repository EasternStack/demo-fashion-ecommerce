"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { getCurrentSession } from "@/server/session";
import type { Result } from "@/server/domain/cart";
import {
  resetUserPassword,
  setUserRole,
  setUserSuspended,
} from "@/server/domain/admin-users";

function revalidateUser(targetId: string) {
  revalidatePath("/admin/pengguna");
  revalidatePath(`/admin/pengguna/${targetId}`);
}

export async function setUserRoleAction(
  targetId: string,
  role: Role,
): Promise<Result> {
  const session = await getCurrentSession();
  const result = await setUserRole(targetId, role, session);
  if ("error" in result) return result;
  revalidateUser(targetId);
  return result;
}

export async function setUserSuspendedAction(
  targetId: string,
  suspended: boolean,
): Promise<Result> {
  const session = await getCurrentSession();
  const result = await setUserSuspended(targetId, suspended, session);
  if ("error" in result) return result;
  revalidateUser(targetId);
  return result;
}

export async function resetUserPasswordAction(
  targetId: string,
  password: string,
): Promise<Result> {
  const session = await getCurrentSession();
  const result = await resetUserPassword(targetId, password, session);
  if ("error" in result) return result;
  revalidateUser(targetId);
  return result;
}
