import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/lib/server/events";
import { Checkout } from "@/components/Checkout";
import { EventDetails } from "@/components/EventDetails";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seu evento" };

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) notFound();
  return (
    <div className="container event-layout">
      <EventDetails event={event} />
      <Checkout event={event} />
    </div>
  );
}
