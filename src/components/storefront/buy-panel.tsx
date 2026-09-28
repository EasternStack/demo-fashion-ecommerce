import { VariantPicker } from "@/components/variant-picker";
import { Stars } from "@/components/storefront/stars";
import { formatIDR } from "@/lib/format";
import type { ProductDetail } from "@/server/domain/catalog";
import type { ReviewSummary } from "@/server/domain/reviews";

type Props = { product: ProductDetail; summary: ReviewSummary };

export function BuyPanel({ product, summary }: Props) {
  return (
    <VariantPicker variants={product.variants} images={product.images} slug={product.slug}>
      <div>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">{product.name}</h1>
        {summary.count > 0 ? (
          <a href="#ulasan" className="mt-2 flex w-fit items-center gap-2 text-sm hover:underline">
            <Stars value={summary.average} />
            <span>{summary.average.toFixed(1).replace(".", ",")}</span>
            <span className="opacity-70">({summary.count} ulasan)</span>
          </a>
        ) : (
          <p className="mt-2 text-sm opacity-70">
            <a href="#ulasan" className="hover:underline">Belum ada ulasan — jadilah yang pertama.</a>
          </p>
        )}
        <p className="mt-3 text-xl">{formatIDR(product.basePrice)}</p>
      </div>
      <p className="text-sm leading-relaxed">{product.description}</p>
    </VariantPicker>
  );
}
