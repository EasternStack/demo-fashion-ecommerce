"use client";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { submitReviewAction, type ReviewFormState } from "@/server/actions/storefront";

type Props = { productId: string; slug: string; existing: { rating: number; body: string } | null };

export function ReviewForm({ productId, slug, existing }: Props) {
  const [state, formAction, pending] = useActionState(submitReviewAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4 border-t border-olive/15 pt-6">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <h3 className="text-xs font-semibold uppercase tracking-widest">{existing ? "Perbarui ulasanmu" : "Tulis ulasan"}</h3>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className="cursor-pointer">
            <input type="radio" name="rating" value={i} defaultChecked={existing?.rating === i} required className="peer sr-only" />
            <span
              aria-hidden
              className="text-xl text-olive/25 peer-checked:text-olive peer-focus-visible:outline-2 peer-focus-visible:outline-olive"
            >
              ★
            </span>
          </label>
        ))}
      </div>
      <textarea
        name="body"
        required
        maxLength={2000}
        rows={4}
        defaultValue={existing?.body ?? ""}
        placeholder="Bagaimana pengalamanmu dengan produk ini?"
        className="border border-olive/25 bg-transparent p-3 text-sm focus:outline-2 focus:outline-olive"
      />
      <div className="flex flex-wrap items-center gap-4">
        <button
          disabled={pending}
          className="rounded-full border border-olive px-6 py-2 text-sm font-semibold uppercase tracking-widest hover:bg-lime disabled:opacity-40"
        >
          {existing ? "Perbarui ulasan" : "Kirim ulasan"}
        </button>
        {state?.error && <p className="text-sm font-semibold">{state.error}</p>}
        {state?.ok && <p className="text-sm">Ulasan tersimpan.</p>}
      </div>
    </form>
  );
}
