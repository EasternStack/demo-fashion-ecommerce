"use client";

import { useState, type ReactNode } from "react";
import type { CatalogVariant } from "@/server/domain/catalog";
import { addToCartAction } from "@/server/actions/storefront";
import { ProductGallery } from "@/components/product-gallery";

type Props = { variants: CatalogVariant[]; images: string[]; slug: string; children?: ReactNode };

function colorSlug(name: string) {
  return name.toLowerCase();
}

export function VariantPicker({ variants, images, slug, children }: Props) {
  const colors = [...new Map(variants.map((v) => [v.colorName, v.colorHex])).entries()];
  const sizes = [...new Set(variants.map((v) => v.size))];
  const [color, setColor] = useState(colors[0]?.[0] ?? "");
  const [size, setSize] = useState("");
  const selected = variants.find((v) => v.colorName === color && v.size === size);
  const gallery = images.filter((i) => i.includes(`-${colorSlug(color)}.`));
  const shown = gallery.length > 0 ? gallery : images;

  return (
    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr]">
      <ProductGallery key={color} images={shown} alt={slug} />
      <div className="flex flex-col gap-5 self-start md:sticky md:top-24">
        {children}
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
                aria-label={`Warna ${name}`}
                className={`h-7 w-7 rounded-full border-2 ${color === name ? "border-olive" : "border-transparent"}`}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest">Ukuran</p>
            <a href="#tabel-ukuran" className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100">
              Panduan ukuran
            </a>
          </div>
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
        <form action={async (formData: FormData) => { await addToCartAction(formData); }} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="variantId" value={selected?.id ?? ""} />
          <input type="hidden" name="qty" value="1" />
          <button
            disabled={!selected || selected.stock === 0}
            className="rounded-full border border-olive px-6 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {selected && selected.stock === 0 ? "Stok habis" : selected ? "Tambah ke Keranjang" : "Pilih warna & ukuran dulu"}
          </button>
          {selected && selected.stock > 0 && <span className="text-sm">Stok: {selected.stock}</span>}
        </form>
        <p className="text-xs uppercase tracking-widest opacity-60">Dikirim dalam 2 hari kerja · Retur 14 hari selama belum dipakai</p>
      </div>
    </div>
  );
}
