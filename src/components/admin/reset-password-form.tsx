"use client";

import { useState, useTransition } from "react";
import { resetUserPasswordAction } from "@/server/actions/admin-users";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function openForm() {
    setMessage(null);
    setOpen(true);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password")?.toString() ?? "";
    start(async () => {
      const result = await resetUserPasswordAction(userId, password);
      if ("error" in result) {
        setMessage(result.error);
      } else {
        setMessage("Password berhasil diganti.");
        setOpen(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password baru (min. 8 karakter)"
            className="w-64 rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none focus:border-olive/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-lime px-4 py-2 text-xs font-semibold uppercase tracking-widest disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-semibold uppercase tracking-widest opacity-60"
          >
            Batal
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={openForm}
          className="self-start rounded-full border border-olive/20 px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-lime"
        >
          Reset Password
        </button>
      )}

      {message && <p className="text-xs font-semibold">{message}</p>}

      <p className="text-xs opacity-60">
        Mengganti password tidak mencabut sesi yang sedang aktif. Gunakan <b>Tangguhkan</b> untuk mencabut akses seketika.
      </p>
    </div>
  );
}
