import { err, json, readObject, send } from "@/lib/http";
import { createBooking, listBookingsDetailed } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return send(await listBookingsDetailed(new URL(req.url).searchParams));
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readObject(req);
    if (!body) return send(err(400, "body must be a JSON object"));
    const key = req.headers.get("idempotency-key")?.trim() || null;
    return send(await createBooking(body, key));
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
}
