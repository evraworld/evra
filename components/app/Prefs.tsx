"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";

type Labels = { language: string; text: string; textMd: string; textLg: string; textXl: string };

// Language and text size live in cookies so pages render right on the server.
export function Prefs({ locale, text, labels }: { locale: Locale; text: string; labels: Labels }) {
  const router = useRouter();
  async function set(p: Record<string, string>) {
    await fetch("/api/prefs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    if (p.locale) {
      document.documentElement.lang = p.locale;
      document.documentElement.dir = p.locale === "ar" ? "rtl" : "ltr";
      document.documentElement.dataset.lang = p.locale;
    }
    router.refresh();
  }
  return (
    <div className="ev-prefs">
      <label>
        <span className="ev-sr">{labels.language}</span>
        <select value={locale} onChange={(e) => set({ locale: e.target.value })}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
          <option value="hi">हिन्दी</option>
        </select>
      </label>
      <label>
        <span className="ev-sr">{labels.text}</span>
        <select value={text} onChange={(e) => set({ text: e.target.value })}>
          <option value="md">{labels.textMd}</option>
          <option value="lg">{labels.textLg}</option>
          <option value="xl">{labels.textXl}</option>
        </select>
      </label>
    </div>
  );
}
