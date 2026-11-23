import type { Metadata } from "next";
import { Instrument_Serif, IBM_Plex_Mono, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

const notoArabic = Noto_Sans_Arabic({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://evra.world"),
  title: "EVRA",
  description: "Creator and brand deals: agree the terms, deliver the work, keep a shared record.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${plexMono.variable} ${notoArabic.variable}`}
    >
      <body>
        {children}
      </body>
    </html>
  );
}
