import { ReviewForm } from "@/components/review-form";
import { Stars } from "@/components/storefront/stars";
import { getOwnReview, getReviewSummary, listReviews } from "@/server/domain/reviews";

const tanggal = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

type Props = { productId: string; slug: string; userId: string | null };

export async function ReviewsSection({ productId, slug, userId }: Props) {
  const [summary, reviews, own] = await Promise.all([
    getReviewSummary(productId),
    listReviews(productId),
    userId ? getOwnReview(productId, userId) : Promise.resolve(null),
  ]);
  return (
    <section id="ulasan" className="reveal-scroll flex flex-col gap-8">
      <h2 className="text-xs font-semibold uppercase tracking-widest">Ulasan Pelanggan</h2>
      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
        <div>
          <p className="text-6xl font-extrabold tracking-tight">{summary.average.toFixed(1).replace(".", ",")}</p>
          <div className="mt-1 flex items-center gap-2">
            <Stars value={summary.average} />
            <span className="text-sm opacity-70">{summary.count} ulasan</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-xs">
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star} className="flex items-center gap-3">
              <span className="w-3 text-right">{star}</span>
              <div className="h-2 flex-1 bg-olive/10">
                <div
                  className="h-full bg-lime"
                  style={{ width: `${summary.count > 0 ? (summary.distribution[star - 1] / summary.count) * 100 : 0}%` }}
                />
              </div>
              <span className="w-8 opacity-60">{summary.distribution[star - 1]}</span>
            </div>
          ))}
        </div>
      </div>
      {reviews.length === 0 ? (
        <p className="text-sm opacity-70">Belum ada ulasan untuk produk ini.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-olive/15 pb-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-semibold">{r.userName}</p>
                <time className="text-xs opacity-60">{tanggal.format(r.createdAt)}</time>
              </div>
              <Stars value={r.rating} className="mt-1" />
              <p className="mt-2 text-sm leading-relaxed">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      {userId ? (
        <ReviewForm productId={productId} slug={slug} existing={own ? { rating: own.rating, body: own.body } : null} />
      ) : (
        <p className="text-sm">
          Punya produk ini?{" "}
          <a className="underline underline-offset-4" href={`/login?next=/produk/${slug}`}>
            Masuk untuk menulis ulasan
          </a>
          .
        </p>
      )}
    </section>
  );
}
