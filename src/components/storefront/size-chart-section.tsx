import type { SizeChart } from "@/lib/size-charts";

type Props = { chart: SizeChart | undefined; sizes: string[]; fit: string | null };

const POINTS = [
  { x: 61, y: 100 },
  { x: 100, y: 172 },
  { x: 130, y: 30 },
  { x: 30, y: 132 },
];

function ApparelDiagram({ points }: { points: number }) {
  return (
    <svg viewBox="0 0 200 190" className="w-40 flex-none" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M70 30 Q100 46 130 30 L158 44 L172 132 L148 138 L139 92 L139 172 L61 172 L61 92 L52 138 L28 132 L42 44 Z" />
      <line x1="61" y1="100" x2="139" y2="100" strokeDasharray="3 3" />
      <line x1="100" y1="38" x2="100" y2="172" strokeDasharray="3 3" />
      <line x1="70" y1="30" x2="130" y2="30" strokeDasharray="3 3" />
      <line x1="42" y1="46" x2="30" y2="132" strokeDasharray="3 3" />
      {POINTS.slice(0, points).map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="7" fill="#f4f6ec" strokeWidth="1" />
          <text x={p.x - 2.5} y={p.y + 3.5} fill="currentColor" stroke="none" fontSize="10">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function SizeChartSection({ chart, sizes, fit }: Props) {
  if (!chart) return null;
  const rows = chart.rows.filter((r) => sizes.includes(r.size));
  if (rows.length === 0) return null;
  return (
    <section id="tabel-ukuran" className="reveal-scroll">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest">Tabel Ukuran</h2>
        <span className="text-xs opacity-60">dalam {chart.unit}</span>
      </div>
      <div className="mt-4 flex flex-col gap-8 md:flex-row md:items-start">
        <table className="w-full border-collapse font-mono text-sm md:max-w-md">
          <thead>
            <tr className="border-b border-olive/35">
              <th className="py-2 pr-4 text-left font-sans text-xs font-semibold uppercase tracking-widest opacity-70">Ukuran</th>
              {chart.columns.map((c, i) => (
                <th key={c} className="py-2 pr-4 text-right font-sans text-xs font-semibold uppercase tracking-widest opacity-70">
                  {i + 1} {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.size} className="border-b border-olive/15">
                <th scope="row" className="py-2 pr-4 text-left font-bold">
                  {r.size}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="py-2 pr-4 text-right">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {chart.kind === "apparel" && <ApparelDiagram points={chart.columns.length} />}
      </div>
      {fit && <p className="mt-4 inline-block rounded-full bg-lime px-4 py-1 text-xs font-semibold">{fit}</p>}
      <p className="mt-3 text-xs italic opacity-65">{chart.measureNote}</p>
    </section>
  );
}
