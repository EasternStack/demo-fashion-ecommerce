import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getReviewSummary, listReviews, submitReview, getOwnReview } from "@/server/domain/reviews";
import type { Session } from "@/server/session";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

beforeEach(cleanDb);

async function makeSession(): Promise<Session> {
  const user = await makeUser();
  return { userId: user.id, role: "CUSTOMER" };
}

describe("reviews", () => {
  it("menolak ulasan tanpa session", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    await expect(submitReview(product.id, { rating: 5, body: "Enak dipakai" }, null)).resolves.toEqual({
      error: "UNAUTHENTICATED",
    });
  });

  it("menolak rating di luar 1-5 dan body kosong", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    const session = await makeSession();
    await expect(submitReview(product.id, { rating: 0, body: "Enak" }, session)).resolves.toEqual({ error: "INVALID" });
    await expect(submitReview(product.id, { rating: 6, body: "Enak" }, session)).resolves.toEqual({ error: "INVALID" });
    await expect(submitReview(product.id, { rating: 4, body: "   " }, session)).resolves.toEqual({ error: "INVALID" });
  });

  it("memperbarui ulasan lama alih-alih membuat duplikat", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    const session = await makeSession();
    await submitReview(product.id, { rating: 3, body: "Biasa saja" }, session);
    await submitReview(product.id, { rating: 5, body: "Ternyata enak dipakai" }, session);
    const summary = await getReviewSummary(product.id);
    expect(summary.count).toBe(1);
    const list = await listReviews(product.id);
    expect(list[0].rating).toBe(5);
    expect(list[0].body).toBe("Ternyata enak dipakai");
    expect(await getOwnReview(product.id, session.userId)).toEqual({ rating: 5, body: "Ternyata enak dipakai" });
  });

  it("menghitung rata-rata dan distribusi dari ulasan", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    expect(await getReviewSummary(product.id)).toEqual({ average: 0, count: 0, distribution: [0, 0, 0, 0, 0] });
    const a = await makeSession();
    const b = await makeSession();
    await submitReview(product.id, { rating: 5, body: "Mantap" }, a);
    await submitReview(product.id, { rating: 4, body: "Bagus" }, b);
    expect(await getReviewSummary(product.id)).toEqual({ average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] });
  });

  it("mengurutkan ulasan dari yang terbaru dengan nama penulis", async () => {
    const cat = await makeCategory();
    const product = await makeProduct(cat.id);
    const a = await makeUser();
    const b = await makeUser();
    await prisma.review.create({
      data: { productId: product.id, userId: a.id, rating: 4, body: "Ulasan lama", createdAt: new Date("2026-01-01") },
    });
    await prisma.review.create({
      data: { productId: product.id, userId: b.id, rating: 5, body: "Ulasan baru", createdAt: new Date("2026-06-01") },
    });
    const list = await listReviews(product.id);
    expect(list.map((r) => r.body)).toEqual(["Ulasan baru", "Ulasan lama"]);
    expect(list[0].userName).toBe(b.name);
  });
});
