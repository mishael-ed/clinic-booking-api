import { Confirmation } from "@/components/Confirmation";
import { getBookingWithSlot } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const booking = await getBookingWithSlot((await params).id);
  return (
    <>
      <h1>Your booking</h1>
      {booking ? <Confirmation booking={booking} /> : <p>We could not find that booking.</p>}
      <a href="/">Back to slots</a>
    </>
  );
}
