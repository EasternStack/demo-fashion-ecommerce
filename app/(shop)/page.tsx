import Link from "next/link";
import { CategoryStrip } from "@/components/storefront/category-strip";
import { LifestyleBanner } from "@/components/storefront/lifestyle-banner";
import { ProductCard } from "@/components/storefront/product-card";
import { listCategories, listProducts } from "@/server/domain/catalog";

export default async function Home() {
  const [categories, pria, wanita] = await Promise.all([
    listCategories(),
    listProducts({ categorySlug: "pria" }),
    listProducts({ categorySlug: "wanita" }),
  ]);
  const perCategory = await Promise.all(categories.map((c) => listProducts({ categorySlug: c.slug })));
  const items = categories.map((c, i) => ({
    slug: c.slug,
    name: c.name,
    count: perCategory[i].length,
    image: perCategory[i][0]?.images[0],
    polaroid: perCategory[i][1]?.images[0] ?? perCategory[i][0]?.images[0],
  }));
  return (
    <div className="flex flex-col gap-14">
      <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <h1 className="text-5xl font-extrabold uppercase leading-[0.95] tracking-tight md:text-6xl">
          Melangkah ke Masa Depan Gaya
        </h1>
        <div className="flex flex-col justify-center gap-4">
          <p className="text-sm uppercase tracking-wide">
            Temukan gaya trendsetter untuk pria, wanita, dan anak — dari klasik hingga streetwear.
          </p>
          <Link
            href="/kategori/pria"
            className="inline-flex items-center justify-between rounded-full border border-olive px-5 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime"
          >
            Belanja Koleksi Baru <span>→</span>
          </Link>
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-bold">Favorit Minggu Ini</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {pria.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <CategoryStrip items={items} />
      <section>
        <h2 className="text-2xl font-bold">Terbaru untuk Wanita</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {wanita.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <LifestyleBanner items={items} />
    </div>
  );
}
