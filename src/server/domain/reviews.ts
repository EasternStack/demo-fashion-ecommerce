import { prisma } from "@/server/db";
import type { Session } from "@/server/session";

export type ReviewSummary = { average: number; count: number; distribution: number[] };
export type ReviewItem = { id: string; rating: number; body: string; createdAt: Date; userName: string };
export type SubmitReviewInput = { rating: number; body: string };
export type SubmitReviewResult = { error: "UNAUTHENTICATED" | "INVALID" } | { ok: true };

export async function getReviewSummary(productId: string): Promise<ReviewSummary> {
  const groups = await prisma.review.groupBy({ by: ["rating"], where: { productId }, _count: true });
  const distribution = [0, 0, 0, 0, 0];
  let count = 0;
  let total = 0;
  for (const g of groups) {
    distribution[g.rating - 1] = g._count;
    count += g._count;
    total += g.rating * g._count;
  }
  return { average: count > 0 ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

export async function listReviews(productId: string): Promise<ReviewItem[]> {
  const rows = await prisma.review.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    select: { id: true, rating: true, body: true, createdAt: true, user: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, rating: r.rating, body: r.body, createdAt: r.createdAt, userName: r.user.name }));
}

export async function submitReview(productId: string, input: SubmitReviewInput, session: Session | null): Promise<SubmitReviewResult> {
  if (!session) return { error: "UNAUTHENTICATED" };
  const rating = Math.trunc(input.rating);
  const body = input.body.trim();
  if (rating < 1 || rating > 5 || rating !== input.rating || !body || body.length > 2000) return { error: "INVALID" };
  await prisma.review.upsert({
    where: { productId_userId: { productId, userId: session.userId } },
    update: { rating, body },
    create: { productId, userId: session.userId, rating, body },
  });
  return { ok: true };
}

export async function getOwnReview(productId: string, userId: string): Promise<{ rating: number; body: string } | null> {
  const row = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { rating: true, body: true },
  });
  return row;
}
