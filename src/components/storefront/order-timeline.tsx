import type { OrderStatus } from "@prisma/client";

type EventView = { status: OrderStatus; note: string | null; createdAt: Date };

export function OrderTimeline({ events }: { events: EventView[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className={`mt-1 h-3 w-3 rounded-full ${i === events.length - 1 ? "bg-lime ring-2 ring-olive" : "bg-olive/30"}`} />
          <div>
            <p className="font-semibold">{e.status}</p>
            {e.note && <p className="text-xs opacity-70">{e.note}</p>}
            <p className="text-xs opacity-50">{new Date(e.createdAt).toLocaleString("id-ID")}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
