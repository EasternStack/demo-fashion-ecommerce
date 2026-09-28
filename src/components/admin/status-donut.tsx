"use client";

import type { OrderStatus } from "@prisma/client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { CHART, STATUS_HEX } from "./chart-palette";

type Slice = { status: OrderStatus; count: number };

export function StatusDonut({ data }: { data: Slice[] }) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm opacity-50">Belum ada data.</p>;
  }
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" innerRadius="58%" outerRadius="88%" paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.status} fill={STATUS_HEX[d.status]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${Number(value)} pesanan`, ORDER_STATUS_LABELS[name as OrderStatus]]}
              contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold">{total}</span>
          <span className="text-xs uppercase tracking-widest opacity-60">total</span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[d.status] }} />
            <span className="opacity-70">{ORDER_STATUS_LABELS[d.status]}</span>
            <span className="font-bold">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
