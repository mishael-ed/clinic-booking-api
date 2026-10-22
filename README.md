# Clinic Booking API

Clinic booking API plus a small web page, built to the Koya spec (OpenAPI 3.0.3, v1.0) from `Clinic Booking API PRD.pdf`. One Next.js app (App Router) on Vercel, Neon Postgres for storage.

- Live URL: _fill in after deploy_
- API base URL: same as the live URL (routes are served at the root)

## Run locally

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL (Neon pooled string) and API_KEY (32+ chars)
npm run migrate                  # applies migrations/*.sql; never runs automatically on requests
npm run dev
BASE_URL=http://localhost:3000 API_KEY=... npm run smoke
```

`scripts/smoke.ts` calls `/reset` first. Run it only against a non-frozen deployment.

## Levels

1. **L1** `/reset`, `/slots`, `POST /bookings`, `GET /bookings/{id}`. Slot times are stored raw (`start_raw`, `end_raw`) and echoed back exactly as received. A catch-all route returns a JSON 404, wrong methods get 405, and every route checks `X-API-Key` (constant-time) before anything else.
2. **L2** One shared zod schema validates the API and the booking form. Name and email are trimmed and email is lowercased. Unknown slot gives 404, a started slot gives 400.
3. **L3** A partial unique index on `bookings(slot_id) WHERE status = 'confirmed'` prevents double booking; violation `23505` maps to 409. Cancel is a single `UPDATE ... WHERE status = 'confirmed' RETURNING`.
4. **L4** Idempotency keys are claimed with `INSERT ... ON CONFLICT DO NOTHING` and the body is hashed (SHA-256 of key-sorted JSON). Pagination uses the `seq` column, fetches `limit + 1` rows, and the cursor is the base64url of the last `seq`.
5. **L5** Sliding 60s window per normalized email in Postgres, serialized by `pg_advisory_xact_lock(hashtext(email))`. `Retry-After` is the seconds until the oldest attempt in the window ages out, rounded up, minimum 1.

## Decisions (POST /bookings check order)

1. API key (401), then parse JSON (400), then normalize.
2. Idempotency before rate limiting, so replays never become 429s. A different body under the same key gives 422. A pending key is polled for about 3s, and if it is still pending after that the response is 409.
3. Rate limit on the normalized email (skipped if missing or empty), then validate (400), slot exists (404), slot not started (400), insert (409 on conflict).
4. 429 responses do not count toward the window and are not stored against the key: the pending row is deleted so the same key can be retried. 400, 404 and 409 are stored and replayed.
5. If an unexpected error occurs while a key is pending, the pending row is deleted so the key is not stuck.

## Web page

`/` lists slots grouped by day in the visitor's local time with a provider filter, then a book form, then a confirmation (`/b/{id}` looks a booking up again). The browser only calls `/app-api/*`, which calls the service layer directly, so the API key never reaches the client bundle. Each form submission generates one `Idempotency-Key` that is reused on retry.

The optional "My bookings" view is not built. If added, it would expose bookings to anyone who knows an email, which is acceptable for the assessment.

## Deploy

Env vars: `DATABASE_URL` (Neon pooled), `API_KEY`. Run `npm run migrate` against Neon before the first deploy, and put the Vercel region next to the Neon region. After submitting: tag `v1.0-submission`, turn off Vercel Git auto-deploy, and do not call `/reset`.
