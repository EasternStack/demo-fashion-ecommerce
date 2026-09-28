"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Result } from "@/server/domain/cart";

type Props = {
  action: () => Promise<Result>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "plain" | "danger";
};

export function ActionButton({ action, label, pendingLabel, confirm, variant = "plain" }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(() => {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setError(null), 5000);
      }
    });
  }, [action, confirm]);

  const tone =
    variant === "danger"
      ? "border border-red-700 text-red-700 hover:bg-red-50"
      : "bg-lime text-olive hover:brightness-95";

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest disabled:opacity-50 ${tone}`}
      >
        {pending ? (pendingLabel ?? label) : label}
      </button>
      {error && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          {error}
        </div>
      )}
    </>
  );
}
