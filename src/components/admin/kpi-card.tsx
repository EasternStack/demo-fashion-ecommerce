import { formatIDR } from "@/lib/format";

type Props = {
  label: string;
  value: number;
  previous?: number;
  format: "idr" | "count";
};

function render(value: number, format: "idr" | "count") {
  return format === "idr" ? formatIDR(value) : value.toLocaleString("id-ID");
}

export function KpiCard({ label, value, previous, format }: Props) {
  const showDelta = previous !== undefined && previous > 0;
  const delta = showDelta ? Math.round(((value - previous!) / previous!) * 100) : null;

  return (
    <div className="rounded-2xl bg-card p-4">
      <p className="text-xs uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">
        {format === "idr" && value === 0 ? "—" : render(value, format)}
      </p>
      {delta === null ? (
        <p className="mt-1 text-xs opacity-40">tidak ada pembanding</p>
      ) : (
        <p className={`mt-1 text-xs font-semibold ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs periode lalu
        </p>
      )}
    </div>
  );
}
