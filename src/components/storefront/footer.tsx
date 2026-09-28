"use client";

import { useState } from "react";

export function Footer() {
  const [sent, setSent] = useState(false);
  return (
    <footer className="mt-16 border-t border-olive/10 bg-cream">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight">Tampil Percaya Diri</h2>
          <p className="mt-2 text-sm">
            Gaya timeless dan craft modern untuk keseharianmu.
          </p>
        </div>
        <div className="text-sm">
          <h3 className="font-bold uppercase tracking-widest">Bantuan</h3>
          <ul className="mt-2 space-y-1">
            <li>Lacak pesanan via menu Pesanan Saya</li>
            <li>Demo: pembayaran & pengiriman tiruan</li>
          </ul>
        </div>
        <div>
          <h3 className="font-bold uppercase tracking-widest">Kabar & Promo</h3>
          {sent ? (
            <p className="mt-2 text-sm">Terima kasih! Kamu terdaftar (demo).</p>
          ) : (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <input
                type="email"
                required
                placeholder="email@kamu.id"
                className="flex-1 rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none"
              />
              <button className="rounded-full bg-lime px-4 py-2 text-sm font-semibold">Kirim</button>
            </form>
          )}
        </div>
      </div>
      <p className="pb-8 text-center text-xs uppercase tracking-widest opacity-60">
        Easternstack Store — demo e-commerce
      </p>
    </footer>
  );
}
