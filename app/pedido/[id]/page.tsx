import type { Metadata } from "next";
import { OrderTracker } from "@/components/OrderTracker";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pedido privado",
  robots: { index: false, follow: false },
};
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="container order-page">
      <OrderTracker key={id} id={id} />
    </div>
  );
}
