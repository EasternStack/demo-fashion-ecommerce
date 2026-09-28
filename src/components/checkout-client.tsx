"use client";

import { useActionState } from "react";
import { formatIDR } from "@/lib/format";
import { SHIPPING_FLAT_COST } from "@/lib/constants";
import { createOrderAction, type CheckoutState } from "@/server/actions/storefront";

type Props = {
  items: { variantId: string; productName: string; variantLabel: string; qty: number; lineTotal: number }[];
  subtotal: number;
  addresses: { id: string; recipient: string; line1: string; city: string }[];
};

export function CheckoutClient({ items, subtotal, addresses }: Props) {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(createOrderAction, null);
  return (
    <form action={formAction} className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">Checkout</h1>
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-olive/10 bg-white p-6">
          <legend className="px-2 text-sm font-bold uppercase tracking-widest">Alamat Pengiriman</legend>
          {addresses.length > 0 && (
            <select name="addressId" defaultValue="" className="rounded-full border border-olive/20 px-4 py-2 text-sm">
              <option value="">— Isi alamat baru —</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.recipient} — {a.line1}, {a.city}
                </option>
              ))}
            </select>
          )}
          <input name="recipient" placeholder="Nama penerima" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          <input name="phone" placeholder="No. handphone" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          <input name="line1" placeholder="Alamat (jalan, nomor, RT/RW)" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input name="city" placeholder="Kota" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
            <input name="province" placeholder="Provinsi" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
            <input name="postalCode" placeholder="Kode pos" className="rounded-full border border-olive/20 px-4 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="saveAddress" /> Simpan alamat ini
          </label>
        </fieldset>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
      <aside className="h-fit rounded-2xl border border-olive/10 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest">Pesananmu</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.variantId} className="flex justify-between gap-2">
              <span>{i.productName} ({i.variantLabel}) × {i.qty}</span>
              <span>{formatIDR(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-olive/10 pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatIDR(subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Ongkir</dt><dd>{formatIDR(SHIPPING_FLAT_COST)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatIDR(subtotal + SHIPPING_FLAT_COST)}</dd></div>
        </dl>
        <button disabled={pending} className="mt-4 w-full rounded-full bg-lime px-5 py-2 text-sm font-semibold uppercase tracking-widest">
          {pending ? "Membuat pesanan…" : "Buat Pesanan"}
        </button>
      </aside>
    </form>
  );
}
