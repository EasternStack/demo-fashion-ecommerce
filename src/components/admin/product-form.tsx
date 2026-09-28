"use client";

import { useState } from "react";
import { saveProductAction } from "@/server/actions/admin";

type VariantEdit = { id?: string; colorName: string; colorHex: string; size: string; stock: number; sold?: boolean };
type Props = {
  initial?: { id: string; name: string; slug: string; categoryId: string; description: string; basePrice: number; images: string[]; variants: VariantEdit[] };
  categories: { id: string; name: string }[];
};

export function ProductForm({ initial, categories }: Props) {
  const [colors, setColors] = useState<{ name: string; hex: string }[]>(
    [...new Map((initial?.variants ?? []).map((v) => [v.colorName, v.colorHex]))].map(([name, hex]) => ({ name, hex })),
  );
  const [sizes, setSizes] = useState<string[]>([...new Set((initial?.variants ?? []).map((v) => v.size))]);
  const [cells, setCells] = useState<Record<string, number>>(
    Object.fromEntries((initial?.variants ?? []).map((v) => [`${v.colorName}::${v.size}`, v.stock])),
  );
  const [variantIds] = useState<Record<string, string>>(
    Object.fromEntries((initial?.variants ?? []).filter((v) => v.id).map((v) => [`${v.colorName}::${v.size}`, v.id!])),
  );
  const [sold] = useState<Set<string>>(
    new Set((initial?.variants ?? []).filter((v) => v.sold).map((v) => `${v.colorName}::${v.size}`)),
  );
  const [newColor, setNewColor] = useState({ name: "", hex: "#1c1c1c" });
  const [newSize, setNewSize] = useState("");
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const matrix = {
    colors,
    sizes,
    cells: Object.fromEntries(Object.entries(cells).filter(([k]) => {
      const [c, s] = k.split("::");
      return colors.some((x) => x.name === c) && sizes.includes(s);
    })),
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("matrix", JSON.stringify(matrix));
    const result = await saveProductAction(fd);
    if ("error" in result) setError(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <div className="grid gap-3 md:grid-cols-2">
        <input name="name" required defaultValue={initial?.name} placeholder="Nama produk"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm" />
        <input name="slug" defaultValue={initial?.slug} placeholder="slug (opsional, auto dari nama)"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm" />
        <select name="categoryId" defaultValue={initial?.categoryId} required
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm">
          <option value="" disabled>Pilih kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input name="basePrice" type="number" min={1} required defaultValue={initial?.basePrice} placeholder="Harga (rupiah)"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm" />
      </div>
      <textarea name="description" defaultValue={initial?.description} placeholder="Deskripsi"
        className="min-h-24 rounded-2xl border border-olive/20 bg-white px-4 py-2 text-sm" />

      <fieldset className="rounded-2xl border border-olive/10 bg-white p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-widest">Gambar</legend>
        <ul className="flex flex-wrap gap-3 text-xs">
          {(initial?.images ?? []).filter((i) => !removedImages.includes(i)).map((img) => (
            <li key={img} className="flex items-center gap-2">
              <input type="hidden" name="existingImage" value={img} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" className="h-14 w-12 object-cover bg-card" />
              <label className="flex items-center gap-1">
                <input type="checkbox" name="removeImage" value={img}
                  onChange={(e) => setRemovedImages((r) => e.target.checked ? [...r, img] : r.filter((x) => x !== img))} />
                hapus
              </label>
            </li>
          ))}
        </ul>
        <input type="file" name="files" accept=".jpg,.jpeg,.png,.webp" multiple className="mt-2 text-xs" />
      </fieldset>

      <fieldset className="rounded-2xl border border-olive/10 bg-white p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-widest">Matriks Varian (warna &times; ukuran &rarr; stok)</legend>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1">Warna baru
            <input value={newColor.name} onChange={(e) => setNewColor({ ...newColor, name: e.target.value })} placeholder="mis. Sage"
              className="rounded-full border border-olive/20 px-3 py-1" />
          </label>
          <label className="flex flex-col gap-1">Hex
            <input type="color" value={newColor.hex} onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })} />
          </label>
          <button type="button" className="rounded-full border border-olive px-3 py-1"
            onClick={() => {
              if (!newColor.name.trim()) return;
              setColors((c) => [...c, { name: newColor.name.trim(), hex: newColor.hex }]);
              setNewColor({ name: "", hex: "#1c1c1c" });
            }}>
            + Warna
          </button>
          <label className="flex flex-col gap-1">Ukuran baru
            <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="mis. XL"
              className="rounded-full border border-olive/20 px-3 py-1" />
          </label>
          <button type="button" className="rounded-full border border-olive px-3 py-1"
            onClick={() => {
              if (!newSize.trim()) return;
              setSizes((s) => [...s, newSize.trim()]);
              setNewSize("");
            }}>
            + Ukuran
          </button>
        </div>
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left">Warna</th>
              {sizes.map((s) => (
                <th key={s} className="p-1">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c.name}>
                <td className="p-1">
                  <span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: c.hex }} />
                  {c.name}
                </td>
                {sizes.map((s) => {
                  const key = `${c.name}::${s}`;
                  return (
                    <td key={key} className="p-1 text-center">
                      <input
                        type="number"
                        min={0}
                        value={cells[key] ?? ""}
                        placeholder="&mdash;"
                        onChange={(e) => setCells((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="w-16 rounded-full border border-olive/20 px-2 py-1 text-center"
                      />
                      {variantIds[key] && <input type="hidden" name={`vid::${key}`} value={variantIds[key]} />}
                      {sold.has(key) && <p className="text-[10px] opacity-60">terjual</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] opacity-60">Sel kosong = varian tidak dibuat. Varian bertanda &ldquo;terjual&rdquo; tidak bisa dihapus (kosongkan stoknya menjadi 0 bila perlu).</p>
      </fieldset>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="w-fit rounded-full bg-lime px-6 py-2 text-sm font-semibold uppercase tracking-widest">Simpan Produk</button>
    </form>
  );
}
