// Usage: BASE_URL=https://... API_KEY=... npx tsx scripts/smoke.ts
// Calls /reset first, so every run starts clean. Never point this at the frozen submission.
const BASE = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.API_KEY ?? "";
if (!BASE || !KEY) {
  console.error("Set BASE_URL and API_KEY");
  process.exit(1);
}

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, key = KEY) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, headers: res.headers };
}

const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * 3600_000).toISOString().replace(/\.\d+Z$/, "Z");
const book = (slot_id: string, email: string, extra: Record<string, string> = {}, name = "Ada") =>
  call("POST", "/bookings", { slot_id, name, email }, extra);

async function main() {
  // Level 1
  const slots = [
    { id: "s-late", provider: "Dr Ade", start: iso(50), end: iso(51) },
    { id: "s-past", provider: "Dr Ade", start: iso(-5), end: iso(-4) },
    { id: "s-a", provider: "Dr Ade", start: iso(24), end: iso(25) },
    { id: "s-b", provider: "Dr Bola", start: iso(26), end: iso(27) },
    ...Array.from({ length: 30 }, (_, i) => ({ id: `s-x${i}`, provider: "Dr X", start: iso(100 + i), end: iso(101 + i) })),
  ];
  const r = await call("POST", "/reset", { slots });
  check("reset 200", r.status === 200 && r.json?.ok === true && r.json?.slots === slots.length, r);
  check("reset bad payload 400", (await call("POST", "/reset", { slots: "x" })).status === 400);
  check("reset duplicate id 400", (await call("POST", "/reset", { slots: [slots[0], slots[0]] })).status === 400);
  await call("POST", "/reset", { slots });

  const list = await call("GET", "/slots");
  const sorted = [...slots].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  check(
    "slots sorted, times byte-identical",
    JSON.stringify(list.json.slots.slice(0, 5).map((s: any) => [s.id, s.start, s.end])) ===
      JSON.stringify(sorted.slice(0, 5).map((s) => [s.id, s.start, s.end])),
    list.json.slots.slice(0, 5),
  );
  const adeOnly = await call("GET", "/slots?provider=Dr%20Ade");
  check("provider filter exact", adeOnly.json.slots.length === 3 && adeOnly.json.slots.every((s: any) => s.provider === "Dr Ade"));
  check("provider filter case-sensitive", (await call("GET", "/slots?provider=dr%20ade")).json.slots.length === 0);

  // Level 2
  const ok = await book("s-a", " ADA@Example.com ", {}, "  Ada L  ");
  check("book 201 confirmed", ok.status === 201 && ok.json.status === "confirmed", ok);
  check("email lowercased, name trimmed", ok.json.email === "ada@example.com" && ok.json.name === "Ada L", ok.json);
  const got = await call("GET", `/bookings/${ok.json.id}`);
  check("get booking same", got.status === 200 && JSON.stringify(got.json) === JSON.stringify(ok.json), got);
  const missing = await call("GET", "/bookings/nope");
  check("unknown booking 404 with error", missing.status === 404 && typeof missing.json?.error === "string");

  for (const [method, path] of [["POST", "/reset"], ["GET", "/slots"], ["POST", "/bookings"], ["GET", "/bookings?email=a@b.co"], ["GET", "/bookings/x"], ["DELETE", "/bookings/x"]]) {
    const none = await call(method, path, method === "POST" ? {} : undefined, {}, "");
    const wrong = await call(method, path, method === "POST" ? {} : undefined, {}, "wrong");
    check(`401 without/with wrong key: ${method} ${path}`, none.status === 401 && wrong.status === 401, [none.status, wrong.status]);
  }

  const bad = async (name: string, body: unknown) => {
    const x = await call("POST", "/bookings", body);
    check(`400 ${name}`, x.status === 400 && typeof x.json?.error === "string", x);
  };
  await bad("missing slot_id", { name: "A", email: "bad1@example.com" });
  await bad("empty name", { slot_id: "s-b", name: "", email: "bad2@example.com" });
  await bad("whitespace email", { slot_id: "s-b", name: "A", email: "   " });
  await bad('email "ada@"', { slot_id: "s-b", name: "A", email: "ada@" });
  await bad("non-string name", { slot_id: "s-b", name: 5, email: "bad3@example.com" });
  check("malformed JSON 400", (await call("POST", "/bookings", "{nope")).status === 400);
  check("unknown route 404", (await call("GET", "/nothing")).status === 404);
  check("wrong method 405", (await call("PUT", "/slots")).status === 405);
  check("unknown slot 404", (await book("nope", "u1@example.com")).status === 404);
  check("past slot 400", (await book("s-past", "u2@example.com")).status === 400);

  // Level 3
  await call("POST", "/reset", { slots });
  const race = await Promise.all(Array.from({ length: 20 }, (_, i) => book("s-a", `race${i}@example.com`)));
  const codes = race.map((x) => x.status);
  check("20 parallel: one 201, nineteen 409", codes.filter((c) => c === 201).length === 1 && codes.filter((c) => c === 409).length === 19, codes);
  const winner = race.find((x) => x.status === 201)!.json;
  const c1 = await call("DELETE", `/bookings/${winner.id}`);
  check("cancel 200 cancelled", c1.status === 200 && c1.json.status === "cancelled", c1);
  check("second cancel 409", (await call("DELETE", `/bookings/${winner.id}`)).status === 409);
  check("cancel unknown 404", (await call("DELETE", "/bookings/nope")).status === 404);
  const after = await call("GET", "/slots");
  check("slot available again", after.json.slots.find((s: any) => s.id === "s-a").available === true);
  check("rebook 201", (await book("s-a", "rebook@example.com")).status === 201);

  // Level 4: idempotency
  const body = { slot_id: "s-b", name: "Idem", email: "idem@example.com" };
  const k1 = { "Idempotency-Key": `k-${Date.now()}-1` };
  const i1 = await call("POST", "/bookings", body, k1);
  const i2 = await call("POST", "/bookings", { email: "idem@example.com", name: "Idem", slot_id: "s-b" }, k1);
  check("same key+body: same status and id", i1.status === 201 && i2.status === 201 && i1.json.id === i2.json.id, [i1, i2]);
  const i3 = await call("POST", "/bookings", { ...body, name: "Other" }, k1);
  check("same key, different body 422", i3.status === 422, i3);
  const k2 = { "Idempotency-Key": `k-${Date.now()}-2` };
  const par = await Promise.all(Array.from({ length: 10 }, () => call("POST", "/bookings", { slot_id: "s-late", name: "P", email: "par@example.com" }, k2)));
  check("10 parallel same key: one booking", new Set(par.map((x) => x.json.id)).size === 1 && par.every((x) => x.status === 201), par.map((x) => x.status));

  // Level 4: pagination
  const email = "pager@example.com";
  // The rate limit allows 5 attempts a minute per email, so wait out Retry-After and retry with the same key.
  for (let i = 0; i < 23; i++) {
    const headers = { "Idempotency-Key": `pg-${Date.now()}-${i}` };
    for (;;) {
      const x = await call("POST", "/bookings", { slot_id: `s-x${i}`, name: "Pg", email: email.toUpperCase() }, headers);
      if (x.status !== 429) break;
      const wait = Number(x.headers.get("Retry-After")) || 1;
      console.log(`  rate limited while seeding, waiting ${wait}s`);
      await new Promise((res) => setTimeout(res, wait * 1000 + 200));
    }
  }
  const seen: string[] = [];
  const sizes: number[] = [];
  let cursor: string | null = null;
  let last: any = null;
  do {
    const page: any = await call("GET", `/bookings?email=${encodeURIComponent("PAGER@Example.com")}&limit=10${cursor ? `&cursor=${cursor}` : ""}`);
    sizes.push(page.json.bookings.length);
    seen.push(...page.json.bookings.map((b: any) => b.id));
    cursor = page.json.next_cursor;
    last = page;
  } while (cursor);
  check("pages of 10, 10, 3 with no gaps or repeats", sizes.join() === "10,10,3" && new Set(seen).size === 23, sizes);
  check("last next_cursor null", last.json.next_cursor === null);
  for (const l of ["0", "51", "abc", "2.5"]) {
    check(`limit=${l} 400`, (await call("GET", `/bookings?email=a@b.co&limit=${l}`)).status === 400);
  }
  check("missing email 400", (await call("GET", "/bookings")).status === 400);
  check("bad cursor 400", (await call("GET", "/bookings?email=a@b.co&cursor=!!!")).status === 400);
  const none = await call("GET", "/bookings?email=nobody@example.com");
  check("unknown email empty", none.status === 200 && none.json.bookings.length === 0 && none.json.next_cursor === null);

  // Level 5: rate limit (pager@ already used 23 attempts; use a fresh email)
  await call("POST", "/reset", { slots });
  const rl = "rate@example.com";
  const attempts = [
    await book("s-a", rl),
    await book("s-a", rl), // 409
    await book("nope", rl), // 404
    await book("s-past", rl), // 400
    await call("POST", "/bookings", { slot_id: "s-a", name: "", email: rl }), // 400
  ];
  check("5 mixed attempts behave normally", attempts.map((x) => x.status).join() === "201,409,404,400,400", attempts.map((x) => x.status));
  const sixth = await book("s-b", rl);
  const retry = Number(sixth.headers.get("Retry-After"));
  check("6th is 429 with integer Retry-After", sixth.status === 429 && Number.isInteger(retry) && retry >= 1, [sixth.status, retry]);
  check("different email books fine", (await book("s-b", "other-rate@example.com")).status === 201);
  const replay = await call("POST", "/bookings", { slot_id: "s-a", name: "Ada", email: rl }, { "Idempotency-Key": "never-used" });
  check("new key still limited", replay.status === 429);
  console.log(`waiting ${retry}s for the window...`);
  await new Promise((res) => setTimeout(res, retry * 1000 + 500));
  check("books again after Retry-After", (await book("s-b", rl)).status !== 429);
  for (let i = 0; i < 5; i++) await book("nope", rl);
  check("limited again", (await book("nope", rl)).status === 429);
  await call("POST", "/reset", { slots });
  check("reset clears the limit", (await book("s-a", rl)).status === 201);

  console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
