import { notFound } from "next/navigation";
import { ProductCard } from "@/components/storefront/product-card";
import { listCategories, listProducts } from "@/server/domain/catalog";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [categories, products] = await Promise.all([listCategories(), listProducts({ categorySlug: slug })]);
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();
  return (
    <div>
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">{category.name}</h1>
      <p className="mt-1 text-sm opacity-70">{products.length} produk</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
