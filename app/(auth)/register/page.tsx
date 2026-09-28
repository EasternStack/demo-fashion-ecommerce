"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "@/server/actions/auth";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(registerAction, null);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Daftar</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input name="name" required placeholder="Nama lengkap"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        <input name="email" type="email" required placeholder="Email"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        <input name="password" type="password" required minLength={8} placeholder="Password (min. 8 karakter)"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button disabled={pending}
          className="rounded-full border border-olive px-4 py-2 text-sm font-semibold uppercase tracking-wide hover:bg-lime">
          {pending ? "Memproses…" : "Daftar"}
        </button>
      </form>
      <p className="text-sm">
        Sudah punya akun? <a className="underline" href="/login">Masuk</a>
      </p>
    </main>
  );
}
