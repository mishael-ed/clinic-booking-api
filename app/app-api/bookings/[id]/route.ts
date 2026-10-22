import { json } from "@/lib/http";
import { getBookingWithSlot } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const booking = await getBookingWithSlot((await params).id);
    return booking ? json(booking) : json({ error: "booking not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
}
