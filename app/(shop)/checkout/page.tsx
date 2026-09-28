import { redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout-client";
import { getCartView } from "@/server/domain/cart";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";

export default async function CheckoutPage() {
  const session = await requireUser();
  const cart = await getCartView(session.userId);
  if (cart.items.length === 0) redirect("/cart");
  const addresses = await prisma.address.findMany({ where: { userId: session.userId } });
  return (
    <CheckoutClient
      items={cart.items.map((i) => ({
        variantId: i.variantId,
        productName: i.productName,
        variantLabel: i.variantLabel,
        qty: i.qty,
        lineTotal: i.lineTotal,
      }))}
      subtotal={cart.subtotal}
      addresses={addresses}
    />
  );
}
