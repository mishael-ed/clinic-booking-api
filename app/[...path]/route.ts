import { err, route } from "@/lib/http";

// Unknown routes: 401 without a valid key, otherwise a JSON 404.
const notFound = async () => err(404, "not found");

const h = route({
  GET: notFound,
  POST: notFound,
  PUT: notFound,
  PATCH: notFound,
  DELETE: notFound,
});

export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const OPTIONS = h.OPTIONS;
