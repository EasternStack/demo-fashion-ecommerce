import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyPanel } from "@/components/storefront/buy-panel";
import { DetailCare } from "@/components/storefront/detail-care";
import { ProductCard } from "@/components/storefront/product-card";
import { SizeChartSection } from "@/components/storefront/size-chart-section";
import { ReviewsSection } from "@/components/storefront/reviews-section";
import { getSizeChart } from "@/lib/size-charts";
import { getProductBySlug, listProducts } from "@/server/domain/catalog";
import { getReviewSummary } from "@/server/domain/reviews";
import { getCurrentSession } from "@/server/session";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [summary, sameCategory, session] = await Promise.all([
    getReviewSummary(product.id),
    listProducts({ categorySlug: product.categorySlug }),
    getCurrentSession(),
  ]);
  const related = sameCategory.filter((p) => p.id !== product.id).slice(0, 4);
  return (
    <div className="flex flex-col gap-14">
      <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-widest opacity-70">
        <Link href="/" className="hover:opacity-100">Beranda</Link>
        {" / "}
        <Link href={`/kategori/${product.categorySlug}`} className="hover:opacity-100">{product.categoryName}</Link>
        {" / "}
        <span>{product.name}</span>
      </nav>
      <BuyPanel product={product} summary={summary} />
      <DetailCare features={product.features} material={product.material} careInstructions={product.careInstructions} />
      <SizeChartSection chart={getSizeChart(product.categorySlug)} sizes={product.sizes} fit={product.fit} />
      <ReviewsSection productId={product.id} slug={product.slug} userId={session?.userId ?? null} />
      {related.length > 0 && (
        <section className="reveal-scroll">
          <h2 className="text-xs font-semibold uppercase tracking-widest">Produk Terkait</h2>
          <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
