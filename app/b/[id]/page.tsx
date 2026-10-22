import { Confirmation } from "@/components/Confirmation";
import { getBookingWithSlot } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const booking = await getBookingWithSlot((await params).id);
  return (
    <>
      <header className="top">
        <h1>Your booking</h1>
        <a className="pill" href="/">Back to slots</a>
      </header>
      {booking ? <Confirmation booking={booking} showLookup={false} /> : <p className="banner-error">We could not find that booking.</p>}
    </>
  );
}
