import { createHash, timingSafeEqual } from "node:crypto";
import type { Result } from "./types";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers });
}

export function err(status: number, message: string, headers?: Record<string, string>): Result {
  return { status, body: { error: message }, headers };
}

export function send(r: Result) {
  return json(r.body, r.status, r.headers);
}

function digest(s: string) {
  return createHash("sha256").update(s).digest();
}

/** Constant-time comparison of the X-API-Key header against API_KEY. */
export function authorized(req: Request): boolean {
  const expected = process.env.API_KEY;
  const given = req.headers.get("x-api-key");
  if (!expected || given === null) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

/** Reads the body as a JSON object. Returns null if malformed or not an object. */
export async function readObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await req.json();
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

type Ctx = { params: Promise<Record<string, string | string[]>> };
type Handler = (req: Request, params: Record<string, string>) => Promise<Result>;

/**
 * Builds the method handlers for a route: API key check first (OPTIONS exempt),
 * then 405 for undeclared methods, and 500 {"error": "internal error"} on exceptions.
 */
export function route(handlers: Partial<Record<Method, Handler>>) {
  const allow = [...Object.keys(handlers), "OPTIONS"].join(", ");
  const out = {} as Record<Method | "OPTIONS", (req: Request, ctx: Ctx) => Promise<Response>>;

  for (const m of METHODS) {
    out[m] = async (req, ctx) => {
      try {
        if (!authorized(req)) return json({ error: "unauthorized" }, 401);
        const h = handlers[m];
        if (!h) return json({ error: "method not allowed" }, 405, { Allow: allow });
        return send(await h(req, (await ctx.params) as Record<string, string>));
      } catch (e) {
        console.error(e);
        return json({ error: "internal error" }, 500);
      }
    };
  }

  out.OPTIONS = async () =>
    new Response(null, {
      status: 204,
      headers: {
        Allow: allow,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": allow,
        "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Idempotency-Key",
      },
    });

  return out;
}
