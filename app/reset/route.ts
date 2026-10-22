import { err, readObject, route } from "@/lib/http";
import { reset } from "@/lib/service";

const h = route({
  POST: async (req) => {
    const body = await readObject(req);
    if (!body) return err(400, "body must be a JSON object");
    return reset(body);
  },
});

export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const OPTIONS = h.OPTIONS;
