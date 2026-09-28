"use client";

import { useTransition } from "react";
import { removeCartItemAction, setCartQtyAction } from "@/server/actions/storefront";

type Props = { variantId: string; qty: number; stock: number };

export function QtyStepper({ variantId, qty, stock }: Props) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        disabled={pending || qty <= 1}
        onClick={() => start(async () => { await setCartQtyAction(variantId, qty - 1); })}
        className="h-7 w-7 rounded-full border border-olive/25 disabled:opacity-40"
      >
        −
      </button>
      <span className="w-6 text-center">{qty}</span>
      <button
        disabled={pending || qty >= stock}
        onClick={() => start(async () => { await setCartQtyAction(variantId, qty + 1); })}
        className="h-7 w-7 rounded-full border border-olive/25 disabled:opacity-40"
      >
        +
      </button>
      <button
        disabled={pending}
        onClick={() => start(async () => { await removeCartItemAction(variantId); })}
        className="ml-2 underline"
      >
        Hapus
      </button>
    </div>
  );
}
