import { redirect } from "next/navigation";
import { PaymentGateway } from "@/components/payment-gateway";
import { getOrderForUser } from "@/server/domain/orders";
import { requireUser } from "@/server/session";

export default async function PaymentPage({ params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const session = await requireUser();
  const order = await getOrderForUser(session.userId, orderCode);
  if (!order) redirect("/akun/pesanan");
  if (order.status !== "PENDING") redirect(`/akun/pesanan/${orderCode}`);
  return <PaymentGateway orderCode={order.code} total={order.total} />;
}
