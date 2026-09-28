"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SearchForm({ placeholder, label = "Cari" }: { placeholder: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q")?.toString().trim() ?? "";
    const next = new URLSearchParams(params.toString());
    if (q) next.set("q", q);
    else next.delete("q");
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        name="q"
        defaultValue={params.get("q") ?? ""}
        placeholder={placeholder}
        className="w-64 rounded-full border border-olive/15 bg-white px-4 py-2 text-sm outline-none focus:border-olive/40"
      />
      <button
        type="submit"
        className="rounded-full border border-olive px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-lime"
      >
        {label}
      </button>
    </form>
  );
}
