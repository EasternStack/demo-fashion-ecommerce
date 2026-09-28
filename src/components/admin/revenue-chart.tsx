"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "./chart-palette";

type Point = { date: string; total: number };

export function RevenueChart({ data }: { data: Point[] }) {
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return <p className="py-16 text-center text-sm opacity-50">Belum ada data.</p>;
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.lime} stopOpacity={0.75} />
              <stop offset="100%" stopColor={CHART.lime} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: CHART.olive }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={24}
            stroke={CHART.grid}
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART.olive }}
            width={70}
            stroke={CHART.grid}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))}
          />
          <Tooltip
            formatter={(value) => [`Rp ${Number(value).toLocaleString("id-ID")}`, "Revenue"]}
            contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke={CHART.olive}
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
