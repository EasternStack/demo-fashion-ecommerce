"use client";

import { useState } from "react";

type Props = { images: string[]; alt: string };

export function ProductGallery({ images, alt }: Props) {
  const [active, setActive] = useState(0);
  const src = images[active] ?? images[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[4/5] bg-card">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((img, i) => (
            <button
              key={img}
              type="button"
              onClick={() => setActive(i)}
              aria-current={i === active}
              aria-label={`Lihat gambar ${i + 1}`}
              className={`h-20 w-16 overflow-hidden border-2 ${i === active ? "border-olive" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
