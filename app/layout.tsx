import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book a clinic appointment",
  description: "Find an open slot and book it.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="frame">
          <Nav />
          <main className="panel">{children}</main>
        </div>
      </body>
    </html>
  );
}
