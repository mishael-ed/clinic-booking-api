import { json, send } from "@/lib/http";
import { listSlots } from "@/lib/service";

export const dynamic = "force-dynamic";

// Browser-facing proxy: the page never sees the API key, and these handlers
// call the service layer directly rather than going through the keyed routes.
export async function GET(req: Request) {
  try {
    return send(await listSlots(new URL(req.url).searchParams.get("provider")));
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
}
