import type { Metadata, Viewport } from "next";
import {
  Archivo,
  Bodoni_Moda,
  Caveat,
  Instrument_Serif,
  Source_Serif_4,
  Space_Mono,
} from "next/font/google";
import "./globals.css";

// DESIGN.md substitutes: Bodoni Moda (Canopee), Source Serif 4 (Editorial New).
// The rest are story-only faces used by the canvas templates (see lib/story/draw.ts).
const display = Bodoni_Moda({ subsets: ["latin"], variable: "--font-story-display", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["300", "400", "600"], variable: "--font-story-serif", display: "swap" });
const italic = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-story-italic", display: "swap" });
const sans = Archivo({ subsets: ["latin"], weight: ["700"], variable: "--font-story-sans", display: "swap" });
const hand = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-story-hand", display: "swap" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-story-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Tasteframe — One photo. Three Stories. Your taste.",
  description:
    "Turn a photo into Instagram Story designs shaped by its visual mood and your cultural taste (powered by Qloo).",
  // Circular monogram for tabs (app/favicon.ico is generated from it for legacy requests).
  // iOS fills transparent corners with black, so the home-screen icon is the square original.
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "512x512" }],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#e2dedb", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const vars = [display, serif, italic, sans, hand, mono].map((f) => f.variable).join(" ");
  return (
    <html lang="en" className={vars}>
      <body>{children}</body>
    </html>
  );
}
