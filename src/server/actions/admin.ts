"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { adminTransition } from "@/server/domain/orders";
import { saveProduct, toggleProductActive, type ProductInput, type VariantInput } from "@/server/domain/admin-catalog";
import type { OrderStatus } from "@prisma/client";

const UPLOAD_DIR = path.resolve(process.cwd(), "var/uploads");
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp"];

type MatrixJson = { colors: { name: string; hex: string }[]; sizes: string[]; cells: Record<string, number> };

export async function saveProductAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const session = await getCurrentSession();
  const matrix = JSON.parse(String(formData.get("matrix") ?? "{}")) as MatrixJson;
  const variants: VariantInput[] = [];
  for (const [key, stock] of Object.entries(matrix.cells)) {
    const [colorName, size] = key.split("::");
    const color = matrix.colors.find((c) => c.name === colorName);
    if (!color) continue;
    const existingId = String(formData.get(`vid::${key}`) ?? "") || undefined;
    variants.push({ id: existingId, colorName, colorHex: color.hex, size, stock });
  }
  const images: string[] = [];
  for (const value of formData.getAll("existingImage")) images.push(String(value));
  const removed = new Set(
    formData.getAll("removeImage").map((v) => String(v)),
  );
  const keptImages = images.filter((i) => !removed.has(i));

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  await mkdir(UPLOAD_DIR, { recursive: true });
  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return { error: `Format gambar tidak didukung: ${file.name}` };
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, safe), buffer);
    keptImages.push(`/uploads/${safe}`);
  }

  const input: ProductInput = {
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    description: String(formData.get("description") ?? ""),
    basePrice: Number(formData.get("basePrice") ?? 0),
    images: keptImages,
    variants,
  };
  const result = await saveProduct(input, session);
  if ("error" in result) return result;
  revalidatePath("/admin/produk");
  redirect(`/admin/produk/${result.id}/edit`);
}

export async function toggleProductActiveAction(productId: string): Promise<{ ok: true } | { error: string }> {
  const session = await getCurrentSession();
  const result = await toggleProductActive(productId, session);
  if ("error" in result) return result;
  revalidatePath("/admin/produk");
  return { ok: true };
}

export async function adminOrderTransitionAction(orderCode: string, to: OrderStatus): Promise<{ ok: true } | { error: string }> {
  const session = await getCurrentSession();
  const result = await adminTransition(orderCode, to, session);
  if ("error" in result) return result;
  revalidatePath("/admin/pesanan");
  revalidatePath(`/admin/pesanan/${orderCode}`);
  return { ok: true };
}
