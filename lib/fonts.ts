import { IBM_Plex_Sans, Noto_Sans_Devanagari } from "next/font/google";

// The root layout loads Instrument Serif, IBM Plex Mono and Noto Sans Arabic on <html>.
export const plexSans = IBM_Plex_Sans({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-sans", display: "swap" });
export const notoDeva = Noto_Sans_Devanagari({ weight: ["400", "600"], subsets: ["devanagari"], variable: "--font-deva", display: "swap" });

export const appFontClasses = `${plexSans.variable} ${notoDeva.variable}`;
