"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthState } from "@/server/actions/auth";

function LoginInner() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(loginAction, null);
  const next = useSearchParams().get("next") ?? "";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-extrabold uppercase tracking-tight">Masuk</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input name="email" type="email" required placeholder="Email"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        <input name="password" type="password" required placeholder="Password"
          className="rounded-full border border-olive/20 bg-white px-4 py-2 text-sm outline-none" />
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button disabled={pending}
          className="rounded-full border border-olive px-4 py-2 text-sm font-semibold uppercase tracking-wide hover:bg-lime">
          {pending ? "Memproses…" : "Masuk"}
        </button>
      </form>
      <p className="text-sm">
        Belum punya akun? <a className="underline" href="/register">Daftar</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
