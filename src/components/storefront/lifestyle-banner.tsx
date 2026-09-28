type BannerItem = {
  slug: string;
  name: string;
  count: number;
  polaroid?: string;
};

function Polaroid({
  src,
  caption,
  className,
  tilt,
}: {
  src: string;
  caption: string;
  className: string;
  tilt: string;
}) {
  return (
    <figure
      className={`reveal-drop absolute z-10 hidden w-36 bg-cream p-2 pb-4 shadow-2xl transition-transform duration-300 hover:rotate-0 hover:scale-[1.04] md:block lg:w-40 ${tilt} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={caption} className="aspect-square w-full object-cover" />
      <figcaption className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-olive">
        {caption}
      </figcaption>
    </figure>
  );
}

export function LifestyleBanner({ items }: { items: BannerItem[] }) {
  const tas = items.find((i) => i.slug === "tas");
  const kacamata = items.find((i) => i.slug === "kacamata");
  const lines = [
    { text: "Gaya Hidup", count: 0, shift: "" },
    { text: tas?.name ?? "Tas", count: tas?.count ?? 0, shift: "lg:-translate-x-4" },
    { text: kacamata?.name ?? "Kacamata", count: kacamata?.count ?? 0, shift: "lg:translate-x-3" },
    { text: "Barang", count: 0, shift: "lg:-translate-x-2" },
    { text: "Handcrafted", count: 0, shift: "lg:translate-x-2" },
    { text: "Untuk Keseharian", count: 0, shift: "lg:translate-x-5" },
  ];
  return (
    <section className="relative -mx-[calc(50vw-50%)] overflow-hidden bg-olive py-20 text-center md:py-28">
      <div aria-hidden className="grain pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_35%,rgba(200,241,105,0.10),transparent_70%)]"
      />
      {tas?.polaroid && (
        <Polaroid src={tas.polaroid} caption={tas.name} tilt="-rotate-6" className="left-[4%] top-[26%]" />
      )}
      {kacamata?.polaroid && (
        <Polaroid src={kacamata.polaroid} caption={kacamata.name} tilt="rotate-6" className="right-[4%] top-[30%]" />
      )}
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-1 px-4">
        {lines.map((line) => (
          <p
            key={line.text}
            className={`reveal-scroll text-4xl font-extrabold uppercase leading-[1.08] tracking-tight text-cream/75 md:text-5xl lg:text-6xl ${line.shift}`}
          >
            {line.text}
            {line.count > 0 && (
              <sup className="ml-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-lime text-[11px] font-bold text-olive">
                {line.count}
              </sup>
            )}
          </p>
        ))}
      </div>
    </section>
  );
}
