import { json, send } from "@/lib/http";
import { cancelBooking, getBookingWithSlot } from "@/lib/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const booking = await getBookingWithSlot((await params).id);
    return booking ? json(booking) : json({ error: "booking not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    return send(await cancelBooking((await params).id));
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
}
