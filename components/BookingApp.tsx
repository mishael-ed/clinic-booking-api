"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bookingSchema, normalizeBooking } from "@/lib/schemas";
import type { Slot } from "@/lib/types";
import { Confirmation, type ConfirmedBooking } from "./Confirmation";

type Fields = { name: string; email: string };
type FieldErrors = Partial<Record<"name" | "email" | "slot_id", string>>;

const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

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
  const [idemKey, setIdemKey] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [retryable, setRetryable] = useState(false);

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

  const providers = useMemo(() => [...new Set((slots ?? []).map((s) => s.provider))].sort(), [slots]);
  const visible = useMemo(
    () => (slots ?? []).filter((s) => !provider || s.provider === provider),
    [slots, provider],
  );
  const days = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const s of visible) {
      const day = dayFmt.format(new Date(s.start));
      groups.set(day, [...(groups.get(day) ?? []), s]);
    }
    return [...groups];
  }, [visible]);

  function pick(slot: Slot) {
    setSelected(slot);
    setErrors({});
    setBanner("");
    setRetryable(false);
    setIdemKey(null);
  }

  async function submit() {
    if (!selected || submitting) return;
    const body = normalizeBooking({ slot_id: selected.id, ...fields });
    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const i of parsed.error.issues) next[i.path[0] as keyof FieldErrors] ??= i.message;
      setErrors(next);
      return;
    }

    setSubmitting(true);
    setErrors({});
    setBanner("");
    setRetryable(false);
    const key = idemKey ?? crypto.randomUUID();
    setIdemKey(key);

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
      setIdemKey(null); // a definitive answer: the next attempt is a new submission
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
        setIdemKey(key);
        setBanner("Something went wrong.");
        setRetryable(true);
      }
    } catch {
      setBanner("Network problem.");
      setRetryable(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <>
        <h1>Booking confirmed</h1>
        <Confirmation booking={confirmed} />
        <button
          className="secondary"
          onClick={() => {
            setConfirmed(null);
            setSelected(null);
            setIdemKey(null);
            loadSlots();
          }}
        >
          Book another
        </button>
      </>
    );
  }

  if (selected) {
    const s = new Date(selected.start);
    return (
      <>
        <h1>Book with {selected.provider}</h1>
        <p>
          {dayFmt.format(s)}, {timeFmt.format(s)}
        </p>
        {banner && <p className="banner-error" role="alert">{banner}</p>}
        <form
          className="card"
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
            <button type="submit" disabled={submitting}>
              {submitting ? "Booking..." : retryable ? "Retry" : "Book"}
            </button>
            <button type="button" className="secondary" disabled={submitting} onClick={() => setSelected(null)}>
              Back
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <h1>Book a clinic appointment</h1>
      {banner && <p className="banner-error" role="alert">{banner}</p>}
      <label>
        Provider
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {loadError && (
        <p className="banner-error">
          {loadError} <button className="secondary" onClick={loadSlots}>Retry</button>
        </p>
      )}
      {slots === null && !loadError && <p>Loading slots...</p>}
      {slots !== null && days.length === 0 && <p>No slots available.</p>}
      {days.map(([day, list]) => (
        <section key={day}>
          <h2>{day}</h2>
          {list.map((s) => {
            const started = new Date(s.start).getTime() <= Date.now();
            const disabled = started || !s.available;
            return (
              <button key={s.id} className="slot" disabled={disabled} onClick={() => pick(s)}>
                <span>
                  {timeFmt.format(new Date(s.start))}
                  <small>{s.provider}</small>
                </span>
                <span className="tag">{started ? "Started" : !s.available ? "Booked" : "Available"}</span>
              </button>
            );
          })}
        </section>
      ))}
    </>
  );
}
