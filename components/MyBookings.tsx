"use client";

import { useEffect, useState } from "react";
import { EMAIL_PATTERN } from "@/lib/schemas";

type Item = {
  id: string;
  slot_id: string;
  status: "confirmed" | "cancelled";
  provider?: string;
  start?: string;
  end?: string;
};

const PAGE_SIZE = 10;
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export default function MyBookings() {
  const [email, setEmail] = useState("");
  const [searched, setSearched] = useState(""); // the email the list on screen belongs to
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(forEmail: string, after: string | null) {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ email: forEmail, limit: String(PAGE_SIZE) });
      if (after) q.set("cursor", after);
      const res = await fetch(`/app-api/bookings?${q}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 400 ? data.error ?? "Invalid request" : "Could not load bookings.");
        return;
      }
      setItems((prev) => (after ? [...prev, ...data.bookings] : data.bookings));
      setCursor(data.next_cursor);
      setSearched(forEmail);
    } catch {
      setError("Network problem.");
    } finally {
      setLoading(false);
    }
  }

  function search(raw: string) {
    const value = raw.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setFieldError(value ? "email is invalid" : "email is required");
      return;
    }
    setFieldError("");
    setItems([]);
    setCursor(null);
    load(value, null);
  }

  // Arriving from a confirmation: /my-bookings?email=...
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) {
      setEmail(e);
      search(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this booking?")) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/app-api/bookings/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 409) {
        setItems((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
      } else if (res.status === 404) {
        setItems((prev) => prev.filter((b) => b.id !== id));
      } else {
        setError("Could not cancel. Please try again.");
      }
    } catch {
      setError("Network problem.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="top">
        <h1>My bookings</h1>
        <a className="pill" href="/">Book a slot</a>
      </header>

      <form
        className="lookup"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          search(email);
        }}
      >
        <label>
          Email you booked with
          <input
            type="email"
            value={email}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldError && <p className="field-error">{fieldError}</p>}
        </label>
        <button type="submit" className="btn" disabled={loading}>
          {loading && items.length === 0 ? "Searching..." : "Find bookings"}
        </button>
      </form>
      <p className="hint">Anyone who knows an email address can see its bookings here, as there are no accounts.</p>

      {error && (
        <p className="banner-error" role="alert">
          {error}{" "}
          {searched && (
            <button className="btn small" onClick={() => load(searched, null)}>
              Retry
            </button>
          )}
        </p>
      )}

      {searched && !loading && items.length === 0 && !error && (
        <p className="status off">No bookings found for {searched}.</p>
      )}

      {items.map((b) => {
        const when = b.start ? new Date(b.start) : null;
        const upcoming = when ? when.getTime() > Date.now() : false;
        return (
          <div
            key={b.id}
            className={`booking${b.status === "cancelled" ? " disabled" : ""}`}
            role="link"
            tabIndex={0}
            onClick={() => (window.location.href = `/b/${b.id}`)}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && e.key === "Enter") window.location.href = `/b/${b.id}`;
            }}
          >
            <div>
              <b>{b.provider ?? "Appointment"}</b>
              <span className="who">
                {when ? `${dayFmt.format(when)}, ${timeFmt.format(when)}` : b.slot_id}
              </span>
              <span className="id">{b.id}</span>
            </div>
            <span className={`status ${b.status === "confirmed" ? "open" : "off"}`}>
              {b.status === "cancelled" ? "Cancelled" : upcoming ? "Confirmed" : "Past"}
            </span>
            {b.status === "confirmed" && upcoming ? (
              <button
                className="btn small ghost-dark"
                disabled={busyId === b.id}
                onClick={(e) => {
                  e.stopPropagation();
                  cancel(b.id);
                }}
              >
                {busyId === b.id ? "Cancelling..." : "Cancel"}
              </button>
            ) : (
              <span className="btn small ghost-dark">Details</span>
            )}
          </div>
        );
      })}

      {cursor && (
        <button className="btn more" disabled={loading} onClick={() => load(searched, cursor)}>
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </>
  );
}
