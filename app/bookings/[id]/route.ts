import { route } from "@/lib/http";
import { cancelBooking, getBooking } from "@/lib/service";

export const dynamic = "force-dynamic";

const h = route({
  GET: async (_req, { id }) => getBooking(id),
  DELETE: async (_req, { id }) => cancelBooking(id),
});

export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const OPTIONS = h.OPTIONS;
