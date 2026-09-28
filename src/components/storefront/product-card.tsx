import Link from "next/link";
import { formatIDR } from "@/lib/format";
import type { CatalogProduct } from "@/server/domain/catalog";

export function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <Link href={`/produk/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-card">
        {product.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
        )}
        <span className="absolute bottom-0 left-0 right-0 translate-y-full bg-white py-2 text-center text-xs font-semibold uppercase tracking-widest transition-transform group-hover:translate-y-0">
          Lihat Produk
        </span>
      </div>
      <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide">{product.name}</h3>
      <p className="text-sm">{formatIDR(product.basePrice)}</p>
      <div className="mt-1 flex gap-1">
        {product.colors.map((c) => (
          <span key={c.name} title={c.name} className="h-3 w-3 rounded-full border border-olive/20" style={{ background: c.hex }} />
        ))}
      </div>
    </Link>
  );
}
