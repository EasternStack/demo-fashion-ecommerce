import Link from "next/link";
import { QtyStepper } from "@/components/qty-stepper";
import { formatIDR } from "@/lib/format";
import { SHIPPING_FLAT_COST } from "@/lib/constants";
import { getCartView } from "@/server/domain/cart";
import { requireUser } from "@/server/session";

export default async function CartPage() {
  const session = await requireUser();
  const cart = await getCartView(session.userId);
  if (cart.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg">Keranjangmu masih kosong.</p>
        <Link href="/" className="mt-4 inline-block rounded-full border border-olive px-5 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime">
          Mulai Belanja
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        {cart.items.map((item) => (
          <div key={item.variantId} className="flex gap-4 border-b border-olive/10 pb-4">
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt={item.productName} className="h-24 w-20 object-cover bg-card" />
            )}
            <div className="flex-1">
              <Link href={`/produk/${item.slug}`} className="font-semibold uppercase tracking-wide text-sm">
                {item.productName}
              </Link>
              <p className="text-xs opacity-70">{item.variantLabel}</p>
              {!item.active && <p className="text-xs text-red-700">Produk sudah tidak aktif — silakan hapus.</p>}
              {item.qty > item.stock && <p className="text-xs text-red-700">Stok tersisa {item.stock}.</p>}
              <p className="mt-1 text-sm">{formatIDR(item.lineTotal)}</p>
            </div>
            <QtyStepper variantId={item.variantId} qty={item.qty} stock={item.stock} />
          </div>
        ))}
      </div>
      <aside className="h-fit rounded-2xl border border-olive/10 bg-white p-6">
        <h2 className="font-bold uppercase tracking-widest text-sm">Ringkasan</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatIDR(cart.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Ongkir</dt><dd>{formatIDR(SHIPPING_FLAT_COST)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatIDR(cart.subtotal + SHIPPING_FLAT_COST)}</dd></div>
        </dl>
        <Link href="/checkout" className="mt-4 block rounded-full bg-lime px-5 py-2 text-center text-sm font-semibold uppercase tracking-widest">
          Lanjut ke Checkout
        </Link>
      </aside>
    </div>
  );
}
