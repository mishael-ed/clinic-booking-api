"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookingSchema, normalizeBooking } from "@/lib/schemas";
import type { Slot } from "@/lib/types";
import { Confirmation, type ConfirmedBooking } from "./Confirmation";

type Fields = { name: string; email: string };
type FieldErrors = Partial<Record<"name" | "email" | "slot_id", string>>;

const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

const isStarted = (s: Slot) => new Date(s.start).getTime() <= Date.now();
const isOpen = (s: Slot) => s.available && !isStarted(s);

export default function BookingApp() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [provider, setProvider] = useState("");
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Slot | null>(null);
  const [fields, setFields] = useState<Fields>({ name: "", email: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // One key per form submission; reused on retry so a retry can never book twice.
  // Refs, not state: a double click fires twice before React re-renders.
  const keyRef = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [retryable, setRetryable] = useState(false);
  const sideRef = useRef<HTMLElement>(null);

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch("/app-api/slots", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setSlots((await res.json()).slots);
      setLoadError("");
    } catch {
      setLoadError("Could not load slots.");
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const providers = useMemo(() => {
    const byName = new Map<string, Slot[]>();
    for (const s of slots ?? []) byName.set(s.provider, [...(byName.get(s.provider) ?? []), s]);
    return [...byName].sort(([a], [b]) => a.localeCompare(b)).map(([name, list]) => {
      const open = list.filter(isOpen);
      return { name, open: open.length, next: open[0] };
    });
  }, [slots]);

  const openCount = useMemo(() => (slots ?? []).filter(isOpen).length, [slots]);

  const days = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      if (provider && s.provider !== provider) continue;
      const day = dayFmt.format(new Date(s.start));
      groups.set(day, [...(groups.get(day) ?? []), s]);
    }
    return [...groups];
  }, [slots, provider]);

  function pick(slot: Slot) {
    setSelected(slot);
    setErrors({});
    setBanner("");
    setRetryable(false);
    keyRef.current = null;
    // On narrow screens the form sits above the list; bring it into view.
    if (window.matchMedia("(max-width: 900px)").matches) {
      sideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function submit() {
    if (!selected || inFlight.current) return;
    const body = normalizeBooking({ slot_id: selected.id, ...fields });
    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const i of parsed.error.issues) next[i.path[0] as keyof FieldErrors] ??= i.message;
      setErrors(next);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setErrors({});
    setBanner("");
    setRetryable(false);
    const key = (keyRef.current ??= crypto.randomUUID());

    try {
      const res = await fetch("/app-api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201) {
        const booking = await fetch(`/app-api/bookings/${data.id}`).then((r) => r.json());
        setConfirmed(booking);
        return;
      }
      keyRef.current = null; // a definitive answer: the next attempt is a new submission
      if (res.status === 400) {
        const msg: string = data.error ?? "Invalid request";
        const field = (["name", "email", "slot_id"] as const).find((f) => msg.startsWith(f));
        if (field) setErrors({ [field]: msg });
        else setBanner(msg);
      } else if (res.status === 404) {
        setBanner("That slot no longer exists");
        setSelected(null);
        loadSlots();
      } else if (res.status === 409) {
        setBanner("Someone just booked this slot, pick another");
        setSelected(null);
        loadSlots();
      } else if (res.status === 429) {
        const secs = Number(res.headers.get("Retry-After")) || 60;
        setBanner(`Too many attempts, try again in ${secs} seconds`);
      } else {
        keyRef.current = key; // retry must reuse the same key
        setBanner("Something went wrong.");
        setRetryable(true);
      }
    } catch {
      setBanner("Network problem.");
      setRetryable(true);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function bookAnother() {
    setConfirmed(null);
    setSelected(null);
    keyRef.current = null;
    loadSlots();
  }

  const selectedStart = selected ? new Date(selected.start) : null;

  return (
    <>
      <header className="top">
        <h1>Book an appointment</h1>
        <span className="pill">{slots === null ? "Loading" : `${openCount} open`}</span>
      </header>

      <div className="grid">
        <div className="col">
          <h2>Providers</h2>
          <div className="providers">
            <button
              className="provider tone-all"
              aria-pressed={provider === ""}
              onClick={() => setProvider("")}
            >
              <div>
                <div className="badge">All</div>
                <b>All providers</b>
              </div>
              <span>{openCount} open slots</span>
            </button>
            {providers.map((p, i) => (
              <button
                key={p.name}
                className={`provider tone-${i % 3}`}
                aria-pressed={provider === p.name}
                onClick={() => setProvider(provider === p.name ? "" : p.name)}
              >
                <div>
                  <div className="badge">{p.name.replace(/^Dr\.?\s*/i, "").charAt(0).toUpperCase()}</div>
                  <b>{p.name}</b>
                </div>
                <div>
                  <span>{p.open} open slots</span>
                  {p.next && <span className="next">Next {timeFmt.format(new Date(p.next.start))}</span>}
                </div>
              </button>
            ))}
          </div>

          <h2>
            Slots
            <small>{provider || "all providers"}</small>
          </h2>
          {loadError && (
            <p className="banner-error">
              {loadError}{" "}
              <button className="btn small" onClick={loadSlots}>Retry</button>
            </p>
          )}
          {slots === null && !loadError && <p className="lede">Loading slots...</p>}
          {slots !== null && days.length === 0 && <p className="status off">No slots available.</p>}
          {days.map(([day, list]) => (
            <section key={day}>
              <p className="day">{day}</p>
              {list.map((s) => {
                const started = isStarted(s);
                const open = isOpen(s);
                return (
                  <div
                    key={s.id}
                    className={`row-slot${open ? "" : " disabled"}${selected?.id === s.id ? " selected" : ""}`}
                    role="button"
                    tabIndex={open ? 0 : -1}
                    aria-disabled={!open}
                    aria-label={`${s.provider} at ${timeFmt.format(new Date(s.start))}${open ? "" : ", unavailable"}`}
                    onClick={() => open && pick(s)}
                    onKeyDown={(e) => {
                      if (open && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        pick(s);
                      }
                    }}
                  >
                    <span className="time">{timeFmt.format(new Date(s.start))}</span>
                    <span className="who">{s.provider}</span>
                    <span className={`status ${open ? "open" : "off"}`}>
                      {started ? "Started" : s.available ? "Available" : "Booked"}
                    </span>
                    <button className="btn small" tabIndex={-1} disabled={!open}>
                      {selected?.id === s.id ? "Selected" : "Book"}
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <aside className="dark" ref={sideRef}>
          {confirmed ? (
            <>
              <h2>You&apos;re booked!</h2>
              <Confirmation booking={confirmed} />
              <button className="btn" onClick={bookAnother}>Book another</button>
            </>
          ) : selected && selectedStart ? (
            <>
              <h2>Book with {selected.provider}</h2>
              <p className="meta">
                <b>{timeFmt.format(selectedStart)}</b>
                {dayFmt.format(selectedStart)}
              </p>
              {banner && <p className="banner-error" role="alert">{banner}</p>}
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label>
                  Name
                  <input
                    value={fields.name}
                    autoComplete="name"
                    onChange={(e) => setFields({ ...fields, name: e.target.value })}
                  />
                  {errors.name && <p className="field-error">{errors.name}</p>}
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={fields.email}
                    autoComplete="email"
                    onChange={(e) => setFields({ ...fields, email: e.target.value })}
                  />
                  {errors.email && <p className="field-error">{errors.email}</p>}
                </label>
                {errors.slot_id && <p className="field-error">{errors.slot_id}</p>}
                <div className="row">
                  <button type="submit" className="btn" disabled={submitting}>
                    {submitting ? "Booking..." : retryable ? "Retry" : "Confirm booking"}
                  </button>
                  <button type="button" className="btn ghost" disabled={submitting} onClick={() => setSelected(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h2>Book in under a minute</h2>
              <p className="lede">Choose an open slot from the list, enter your name and email, and you&apos;re done.</p>
              {banner && <p className="banner-error" role="alert">{banner}</p>}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
