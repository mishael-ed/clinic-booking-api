import { route } from "@/lib/http";
import { listSlots } from "@/lib/service";

export const dynamic = "force-dynamic";

const h = route({
  GET: async (req) => listSlots(new URL(req.url).searchParams.get("provider")),
});

export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const OPTIONS = h.OPTIONS;
