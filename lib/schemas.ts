import { z } from "zod";

// Shared by the API and the booking form.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const bookingSchema = z.object({
  slot_id: z.string({ message: "slot_id is required" }).min(1, "slot_id is required"),
  name: z.string({ message: "name is required" }).min(1, "name is required"),
  email: z
    .string({ message: "email is required" })
    .min(1, "email is required")
    .regex(EMAIL_PATTERN, "email is invalid"),
});

/** Trim name and email if they are strings; lowercase email. */
export function normalizeBooking(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  if (typeof out.name === "string") out.name = out.name.trim();
  if (typeof out.email === "string") out.email = out.email.trim().toLowerCase();
  return out;
}
