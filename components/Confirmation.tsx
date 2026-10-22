"use client";

import { useEffect, useState } from "react";

export type ConfirmedBooking = {
  id: string;
  email?: string;
  provider: string;
  start: string;
  end: string;
  status: string;
};

// Rendered after mount so the visitor's local time zone is used, not the server's.
export function Confirmation({ booking, showLookup = true }: { booking: ConfirmedBooking; showLookup?: boolean }) {
  const [when, setWhen] = useState("");
  useEffect(() => {
    const s = new Date(booking.start);
    const e = new Date(booking.end);
    setWhen(
      `${s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ` +
        `${s.toLocaleTimeString(undefined, { timeStyle: "short" })} to ${e.toLocaleTimeString(undefined, { timeStyle: "short" })}`,
    );
  }, [booking.start, booking.end]);

  return (
    <div className="card">
      <dl>
        <dt>Booking id</dt>
        <dd>{booking.id}</dd>
        <dt>Provider</dt>
        <dd>{booking.provider}</dd>
        <dt>When</dt>
        <dd>{when}</dd>
        <dt>Status</dt>
        <dd className={`status-${booking.status}`}>{booking.status}</dd>
      </dl>
      <div className="actions">
        {booking.email && (
          <a className="btn" href={`/my-bookings?email=${encodeURIComponent(booking.email)}`}>
            See all my bookings
          </a>
        )}
        {showLookup && (
          <a className="btn ghost-dark" href={`/b/${encodeURIComponent(booking.id)}`}>
            Look this booking up again
          </a>
        )}
      </div>
    </div>
  );
}
