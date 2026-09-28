import Link from "next/link";
import { PAGE_SIZE, pageSlice } from "@/lib/pagination";

type Props = {
  total: number;
  page: number;
  searchParams: Record<string, string | undefined>;
};

export function TablePager({ total, page, searchParams }: Props) {
  const { totalPages, hasPrev, hasNext } = pageSlice(total, page);
  if (totalPages <= 1) return <p className="mt-4 text-xs opacity-60">{total} baris</p>;

  const hrefFor = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const linkClass = "rounded-full border border-olive/20 px-3 py-1 hover:bg-lime";
  const deadClass = "rounded-full border border-olive/10 px-3 py-1 opacity-40";

  return (
    <nav className="mt-4 flex items-center gap-4 text-xs font-semibold uppercase tracking-widest">
      {hasPrev ? (
        <Link href={hrefFor(page - 1)} className={linkClass}>← Sebelumnya</Link>
      ) : (
        <span className={deadClass}>← Sebelumnya</span>
      )}
      <span className="opacity-60">{from}–{to} dari {total}</span>
      {hasNext ? (
        <Link href={hrefFor(page + 1)} className={linkClass}>Berikutnya →</Link>
      ) : (
        <span className={deadClass}>Berikutnya →</span>
      )}
    </nav>
  );
}
