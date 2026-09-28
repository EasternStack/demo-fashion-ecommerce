"use client";

import { useTransition } from "react";
import { toggleProductActiveAction } from "@/server/actions/admin";

export function ToggleActiveButton({ productId, isActive }: { productId: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { await toggleProductActiveAction(productId); })}
      className="underline opacity-70"
    >
      {isActive ? "Nonaktifkan" : "Aktifkan"}
    </button>
  );
}
