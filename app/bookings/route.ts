import { err, readObject, route } from "@/lib/http";
import { createBooking, listBookings } from "@/lib/service";

export const dynamic = "force-dynamic";

const h = route({
  GET: async (req) => listBookings(new URL(req.url).searchParams),
  POST: async (req) => {
    const body = await readObject(req);
    if (!body) return err(400, "body must be a JSON object");
    const key = req.headers.get("idempotency-key")?.trim() || null;
    return createBooking(body, key);
  },
});

export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const OPTIONS = h.OPTIONS;
