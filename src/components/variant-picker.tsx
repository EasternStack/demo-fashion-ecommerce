"use client";

import { useState } from "react";
import type { CatalogVariant } from "@/server/domain/catalog";
import { addToCartAction } from "@/server/actions/storefront";

type Props = { variants: CatalogVariant[]; images: string[]; slug: string };

function colorSlug(name: string) {
  return name.toLowerCase();
}

export function VariantPicker({ variants, images, slug }: Props) {
  const colors = [...new Map(variants.map((v) => [v.colorName, v.colorHex])).entries()];
  const sizes = [...new Set(variants.map((v) => v.size))];
  const [color, setColor] = useState(colors[0]?.[0] ?? "");
  const [size, setSize] = useState("");
  const selected = variants.find((v) => v.colorName === color && v.size === size);
  const gallery = images.filter((i) => i.includes(`-${colorSlug(color)}.`));
  const shown = gallery.length > 0 ? gallery : images;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex aspect-[4/5] max-w-md flex-col gap-2 bg-card">
        {shown.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={`${slug}`} className="h-full w-full object-cover" />
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest">Warna</p>
        <div className="mt-1 flex gap-2">
          {colors.map(([name, hex]) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setColor(name);
                setSize("");
              }}
              title={name}
              className={`h-7 w-7 rounded-full border-2 ${color === name ? "border-olive" : "border-transparent"}`}
              style={{ background: hex }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest">Ukuran</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {sizes.map((s) => {
            const v = variants.find((x) => x.colorName === color && x.size === s);
            const disabled = !v || v.stock === 0;
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => setSize(s)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  size === s ? "border-olive bg-lime font-semibold" : "border-olive/25"
                } ${disabled ? "cursor-not-allowed opacity-40 line-through" : ""}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>
      {selected ? (
        <form action={async (formData: FormData) => { await addToCartAction(formData); }} className="flex items-center gap-3">
          <input type="hidden" name="variantId" value={selected.id} />
          <input type="hidden" name="qty" value={1} />
          <button className="rounded-full border border-olive px-6 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime">
            Tambah ke Tas
          </button>
          <span className="text-sm">Stok: {selected.stock}</span>
        </form>
      ) : (
        <p className="text-sm opacity-70">Pilih warna dan ukuran terlebih dahulu.</p>
      )}
    </div>
  );
}
