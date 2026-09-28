"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";
import { confirmPaymentAction } from "@/server/actions/storefront";

type Props = { orderCode: string; total: number };

export function PaymentGateway({ orderCode, total }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "processing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      cardNumber: String(fd.get("cardNumber") ?? ""),
      expiry: String(fd.get("expiry") ?? ""),
      cvc: String(fd.get("cvc") ?? ""),
    };
    setPhase("processing");
    setError(null);
    await new Promise((r) => setTimeout(r, 2000));
    const result = await confirmPaymentAction(orderCode, input);
    if ("error" in result) {
      setPhase("error");
      setError(result.error);
      return;
    }
    router.push(`/akun/pesanan/${orderCode}?baru=1`);
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-olive/10 bg-white p-8">
      <p className="text-xs font-bold uppercase tracking-widest">MockPay — Gateway Tiruan</p>
      <h1 className="mt-1 text-2xl font-extrabold uppercase tracking-tight">Pembayaran</h1>
      <p className="mt-2 text-sm">
        Pesanan <span className="font-mono">{orderCode}</span> — tagihan{" "}
        <span className="font-bold">{formatIDR(total)}</span>
      </p>
      {phase === "processing" ? (
        <p className="mt-8 animate-pulse text-sm">Memproses pembayaran…</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <input name="cardNumber" required placeholder="Nomor kartu (16 digit)" className="rounded-full border border-olive/20 px-4 py-2 font-mono text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input name="expiry" required placeholder="MM/YY" className="rounded-full border border-olive/20 px-4 py-2 font-mono text-sm" />
            <input name="cvc" required placeholder="CVC" className="rounded-full border border-olive/20 px-4 py-2 font-mono text-sm" />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="rounded-full bg-lime px-5 py-2 text-sm font-semibold uppercase tracking-widest">
            Bayar Sekarang
          </button>
          <p className="text-xs opacity-70">
            Uji: `4242 4242 4242 4242` sukses · `4242 4242 4242 0002` ditolak · expiry `12/29`, CVC `123`
          </p>
        </form>
      )}
    </div>
  );
}
