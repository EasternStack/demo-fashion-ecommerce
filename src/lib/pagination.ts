export const PAGE_SIZE = 25;

export type ListResult<T> = { rows: T[]; total: number };

export function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

export function parseQuery(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/[%_]/g, "").slice(0, 80);
}

export function pageSlice(
  total: number,
  page: number,
): { totalPages: number; hasPrev: boolean; hasNext: boolean } {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { totalPages, hasPrev: page > 1, hasNext: page < totalPages };
}
