import { createHash, randomUUID } from "node:crypto";
import { pool } from "./db";
import { err } from "./http";
import { bookingSchema, normalizeBooking } from "./schemas";
import type { Booking, Result } from "./types";

const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 60;
const PENDING_POLL_MS = 100;
const PENDING_TIMEOUT_MS = 3000;

const BOOKING_COLUMNS = "id, slot_id, name, email, status, created_at";

type BookingRow = Omit<Booking, "created_at"> & { created_at: Date };

function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    slot_id: r.slot_id,
    name: r.name,
    email: r.email,
    status: r.status,
    created_at: new Date(r.created_at).toISOString(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pgCode = (e: unknown) => (e as { code?: string })?.code;

// ---------- POST /reset ----------

export async function reset(body: Record<string, unknown>): Promise<Result> {
  const slots = body.slots;
  if (!Array.isArray(slots)) return err(400, "slots must be an array");

  const rows: { id: string; provider: string; start: string; end: string }[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    if (s === null || typeof s !== "object" || Array.isArray(s)) {
      return err(400, "each slot must be an object");
    }
    const { id, provider, start, end } = s as Record<string, unknown>;
    for (const [k, v] of Object.entries({ id, provider, start, end })) {
      if (typeof v !== "string" || v === "") return err(400, `slot ${k} is required`);
    }
    if (Number.isNaN(Date.parse(start as string)) || Number.isNaN(Date.parse(end as string))) {
      return err(400, "slot start and end must be valid times");
    }
    if (seen.has(id as string)) return err(400, `duplicate slot id: ${id}`);
    seen.add(id as string);
    rows.push({ id, provider, start, end } as (typeof rows)[number]);
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM bookings");
    await client.query("DELETE FROM slots");
    await client.query("DELETE FROM idempotency_keys");
    await client.query("DELETE FROM rate_limit_attempts");
    if (rows.length > 0) {
      await client.query(
        `INSERT INTO slots (id, provider, start_at, end_at, start_raw, end_raw)
         SELECT id, provider, start_raw::timestamptz, end_raw::timestamptz, start_raw, end_raw
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(id, provider, start_raw, end_raw)`,
        [rows.map((r) => r.id), rows.map((r) => r.provider), rows.map((r) => r.start), rows.map((r) => r.end)],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    // A time Date.parse accepts but Postgres rejects is still a bad payload.
    if (pgCode(e)?.startsWith("22")) return err(400, "slot start and end must be valid times");
    throw e;
  } finally {
    client.release();
  }
  return { status: 200, body: { ok: true, slots: rows.length } };
}

// ---------- GET /slots ----------

export async function listSlots(provider: string | null): Promise<Result> {
  const { rows } = await pool().query(
    `SELECT s.id, s.provider, s.start_raw AS start, s.end_raw AS "end",
            NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed') AS available
     FROM slots s
     WHERE ($1::text IS NULL OR s.provider = $1)
     ORDER BY s.start_at, s.id`,
    [provider],
  );
  return { status: 200, body: { slots: rows } };
}

// ---------- POST /bookings ----------

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}

const hashBody = (body: unknown) =>
  createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");

type RateOutcome = { limited: false } | { limited: true; retryAfter: number };

async function checkRateLimit(email: string): Promise<RateOutcome> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
    const { rows } = await client.query(
      `SELECT count(*)::int AS n,
              CEIL(EXTRACT(EPOCH FROM (min(attempted_at) + make_interval(secs => $2) - clock_timestamp())))::int AS retry
       FROM rate_limit_attempts
       WHERE email = $1 AND attempted_at > clock_timestamp() - make_interval(secs => $2)`,
      [email, RATE_WINDOW_SECONDS],
    );
    if (rows[0].n >= RATE_LIMIT) {
      await client.query("COMMIT");
      return { limited: true, retryAfter: Math.max(1, rows[0].retry ?? 1) };
    }
    await client.query("INSERT INTO rate_limit_attempts (email, attempted_at) VALUES ($1, clock_timestamp())", [email]);
    await client.query("COMMIT");
    return { limited: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function insertBooking(input: { slot_id: string; name: string; email: string }): Promise<Result> {
  const db = pool();
  const { rows: slotRows } = await db.query(
    "SELECT start_at <= clock_timestamp() AS started FROM slots WHERE id = $1",
    [input.slot_id],
  );
  if (slotRows.length === 0) return err(404, "slot not found");
  if (slotRows[0].started) return err(400, "slot has already started");

  try {
    const { rows } = await db.query(
      `INSERT INTO bookings (id, slot_id, name, email, status)
       VALUES ($1, $2, $3, $4, 'confirmed') RETURNING ${BOOKING_COLUMNS}`,
      [randomUUID(), input.slot_id, input.name, input.email],
    );
    return { status: 201, body: toBooking(rows[0]) };
  } catch (e) {
    if (pgCode(e) === "23505") return err(409, "slot is already booked");
    if (pgCode(e) === "23503") return err(404, "slot not found");
    throw e;
  }
}

/** Steps 5 to 9 of the check order. */
async function processBooking(body: Record<string, unknown>): Promise<Result> {
  const email = body.email;
  if (typeof email === "string" && email !== "") {
    const rl = await checkRateLimit(email);
    if (rl.limited) {
      return err(429, "too many attempts", { "Retry-After": String(rl.retryAfter) });
    }
  }
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) return err(400, parsed.error.issues[0]?.message ?? "invalid request");
  return insertBooking(parsed.data);
}

async function readStored(key: string): Promise<{ hash: string; status: number | null; body: unknown } | null> {
  const { rows } = await pool().query(
    "SELECT request_hash, status_code, response_body FROM idempotency_keys WHERE key = $1",
    [key],
  );
  if (rows.length === 0) return null;
  return { hash: rows[0].request_hash, status: rows[0].status_code, body: rows[0].response_body };
}

export async function createBooking(raw: Record<string, unknown>, idempotencyKey: string | null): Promise<Result> {
  const body = normalizeBooking(raw);
  if (!idempotencyKey) return processBooking(body);

  const db = pool();
  const hash = hashBody(body);
  const deadline = Date.now() + PENDING_TIMEOUT_MS;

  // Claim the key; whoever inserts the row does the work, everyone else reads it.
  for (;;) {
    const claim = await db.query(
      "INSERT INTO idempotency_keys (key, request_hash) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key",
      [idempotencyKey, hash],
    );
    if (claim.rowCount === 1) break;

    const stored = await readStored(idempotencyKey);
    if (!stored) continue; // released by a 429 between claim and read: claim again
    if (stored.hash !== hash) return err(422, "Idempotency-Key was already used with a different request body");
    if (stored.status !== null) return { status: stored.status, body: stored.body };
    if (Date.now() >= deadline) return err(409, "a request with this Idempotency-Key is still in progress");
    await sleep(PENDING_POLL_MS);
  }

  let result: Result;
  try {
    result = await processBooking(body);
  } catch (e) {
    await db
      .query("DELETE FROM idempotency_keys WHERE key = $1 AND status_code IS NULL", [idempotencyKey])
      .catch(() => {});
    throw e;
  }

  if (result.status === 429) {
    await db.query("DELETE FROM idempotency_keys WHERE key = $1 AND status_code IS NULL", [idempotencyKey]);
  } else {
    await db.query("UPDATE idempotency_keys SET status_code = $2, response_body = $3 WHERE key = $1", [
      idempotencyKey,
      result.status,
      JSON.stringify(result.body),
    ]);
  }
  return result;
}

// ---------- GET/DELETE /bookings/{id} ----------

export async function getBooking(id: string): Promise<Result> {
  const { rows } = await pool().query(`SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1`, [id]);
  if (rows.length === 0) return err(404, "booking not found");
  return { status: 200, body: toBooking(rows[0]) };
}

/** Booking plus its slot, for the confirmation page. */
export async function getBookingWithSlot(id: string) {
  const { rows } = await pool().query(
    `SELECT b.id, b.slot_id, b.name, b.email, b.status, b.created_at,
            s.provider, s.start_raw AS start, s.end_raw AS "end"
     FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const { provider, start, end, ...b } = rows[0];
  return { ...toBooking(b), provider: provider as string, start: start as string, end: end as string };
}

export async function cancelBooking(id: string): Promise<Result> {
  const db = pool();
  const { rows } = await db.query(
    `UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND status = 'confirmed' RETURNING ${BOOKING_COLUMNS}`,
    [id],
  );
  if (rows.length === 1) return { status: 200, body: toBooking(rows[0]) };
  const existing = await db.query("SELECT 1 FROM bookings WHERE id = $1", [id]);
  return existing.rowCount === 0 ? err(404, "booking not found") : err(409, "booking is already cancelled");
}

// ---------- GET /bookings ----------

export async function listBookings(params: URLSearchParams): Promise<Result> {
  const limitRaw = params.get("limit");
  let limit = 10;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw)) return err(400, "limit must be a whole number from 1 to 50");
    limit = Number(limitRaw);
    if (limit < 1 || limit > 50) return err(400, "limit must be a whole number from 1 to 50");
  }

  const email = (params.get("email") ?? "").trim().toLowerCase();
  if (email === "") return err(400, "email is required");

  let after = "0";
  const cursor = params.get("cursor");
  if (cursor !== null) {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!/^[1-9]\d{0,17}$/.test(decoded)) return err(400, "invalid cursor");
    after = decoded;
  }

  const { rows } = await pool().query(
    `SELECT ${BOOKING_COLUMNS}, seq FROM bookings
     WHERE email = $1 AND seq > $2::bigint ORDER BY seq LIMIT $3`,
    [email, after, limit + 1],
  );
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? Buffer.from(String(page[page.length - 1].seq)).toString("base64url") : null;
  return { status: 200, body: { bookings: page.map(toBooking), next_cursor: next } };
}

/** Page-facing list: each booking also carries its slot's provider and times. */
export async function listBookingsDetailed(params: URLSearchParams): Promise<Result> {
  const r = await listBookings(params);
  if (r.status !== 200) return r;
  const { bookings, next_cursor } = r.body as { bookings: Booking[]; next_cursor: string | null };

  const slots = new Map<string, { provider: string; start: string; end: string }>();
  const ids = [...new Set(bookings.map((b) => b.slot_id))];
  if (ids.length > 0) {
    const { rows } = await pool().query(
      `SELECT id, provider, start_raw AS start, end_raw AS "end" FROM slots WHERE id = ANY($1::text[])`,
      [ids],
    );
    for (const s of rows) slots.set(s.id, { provider: s.provider, start: s.start, end: s.end });
  }
  return { status: 200, body: { bookings: bookings.map((b) => ({ ...b, ...slots.get(b.slot_id) })), next_cursor } };
}
