import { notFound } from "next/navigation";
import { VariantPicker } from "@/components/variant-picker";
import { formatIDR } from "@/lib/format";
import { getProductBySlug } from "@/server/domain/catalog";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <VariantPicker variants={product.variants} images={product.images} slug={product.slug} />
      <div>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">{product.name}</h1>
        <p className="mt-2 text-xl">{formatIDR(product.basePrice)}</p>
        <p className="mt-6 text-sm leading-relaxed">{product.description}</p>
      </div>
    </div>
  );
}
