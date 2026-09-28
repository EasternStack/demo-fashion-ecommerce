import { ProductCard } from "@/components/storefront/product-card";
import { listProducts } from "@/server/domain/catalog";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const products = await listProducts({ q: q ?? "" });
  return (
    <div>
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Hasil untuk "{q}"</h1>
      <p className="mt-1 text-sm opacity-70">{products.length} produk ditemukan</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
