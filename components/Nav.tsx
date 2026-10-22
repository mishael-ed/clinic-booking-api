"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MIN = 76; // icons only
const MAX = 300;
const DEFAULT = 232;
const LABELS_AT = 150; // labels show once the sidebar is at least this wide
const STORAGE_KEY = "rail-width";

const icon = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));

export function Nav() {
  const path = usePathname();
  const mine = path.startsWith("/my-bookings") || path.startsWith("/b/");

  const [width, setWidth] = useState(DEFAULT);
  const [dragging, setDragging] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  const expanded = width >= LABELS_AT;

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved) setWidth(clamp(saved));
    } catch {}
  }, []);

  function save(w: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(w));
    } catch {}
  }

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    const left = railRef.current?.getBoundingClientRect().left ?? 0;
    let last = width;
    setDragging(true);

    const move = (ev: PointerEvent) => {
      last = clamp(ev.clientX - left);
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      // Snap to icons-only or the default once released, so it never rests half-labelled.
      const snapped = last < LABELS_AT - 20 ? MIN : last;
      setWidth(snapped);
      save(snapped);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function toggle() {
    const next = expanded ? MIN : DEFAULT;
    setWidth(next);
    save(next);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = clamp(width + (e.key === "ArrowRight" ? 16 : -16));
    setWidth(next);
    save(next);
  }

  return (
    <nav
      ref={railRef}
      className={`rail${expanded ? "" : " collapsed"}${dragging ? " dragging" : ""}`}
      style={{ width }}
      aria-label="Main"
    >
      <a href="/" className="brand" aria-label="Clinix home" />

      <a
        href="/"
        className={`rail-link${mine ? "" : " active"}`}
        aria-current={mine ? undefined : "page"}
        title="Book"
      >
        <svg {...icon}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </svg>
        <span>Book an appointment</span>
      </a>
      <a
        href="/my-bookings"
        className={`rail-link${mine ? " active" : ""}`}
        aria-current={mine ? "page" : undefined}
        title="My bookings"
      >
        <svg {...icon}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.6} />
        </svg>
        <span>My bookings</span>
      </a>

      <button className="rail-link rail-toggle" onClick={toggle} title={expanded ? "Collapse sidebar" : "Expand sidebar"}>
        <svg {...icon} style={{ transform: expanded ? undefined : "rotate(180deg)" }}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>Collapse</span>
      </button>

      <div
        className="rail-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={toggle}
        onKeyDown={onKey}
      />
    </nav>
  );
}
