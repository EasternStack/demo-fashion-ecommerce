import Link from "next/link";

export type CategoryStripItem = {
  slug: string;
  name: string;
  count: number;
  image?: string;
};

export function CategoryStrip({ items }: { items: CategoryStripItem[] }) {
  const total = items.reduce((sum, i) => sum + i.count, 0);
  return (
    <section aria-label="Kategori" className="grid grid-cols-2 gap-3 md:grid-cols-6">
      <div className="col-span-2 flex flex-col justify-between gap-6 bg-olive p-6 text-cream md:col-span-1">
        <p className="text-xs font-bold uppercase tracking-widest text-lime">Jelajah Koleksi</p>
        <h2 className="text-2xl font-extrabold uppercase leading-[1.05]">Gaya baru untuk tampilan modern</h2>
        <p className="text-xs uppercase tracking-widest text-sage">
          {total} produk · {items.length} kategori
        </p>
      </div>
      {items.map((c) => (
        <Link
          key={c.slug}
          href={`/kategori/${c.slug}`}
          className="group relative aspect-[3/4] overflow-hidden bg-card focus-visible:outline-2 focus-visible:outline-lime"
        >
          {c.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-olive/85 to-transparent p-3 pt-10">
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-cream">{c.name}</span>
              <span className="rounded-full bg-lime px-1.5 py-0.5 text-[10px] font-bold leading-none text-olive">
                {c.count}
              </span>
            </span>
          </span>
        </Link>
      ))}
    </section>
  );
}
