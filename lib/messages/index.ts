import { desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { outbox, type Locale } from "@/lib/db/schema";
import { templates, type TemplateData, type TemplateKey } from "./templates";

export function render<K extends TemplateKey>(key: K, locale: Locale, data: TemplateData<K>) {
  const t = templates[key] as Record<Locale, (d: TemplateData<K>) => { subject: string; body: string }>;
  return (t[locale] ?? t.en)(data);
}

// Writes every message to the outbox. A provider (email or WhatsApp) delivers from there in production;
// in development the outbox is the inbox, readable at /dev/outbox.
export async function send<K extends TemplateKey>(
  db: DB,
  msg: { to: string; template: K; locale?: Locale; data: TemplateData<K>; channel?: "email" | "whatsapp" | "push"; test?: boolean },
) {
  const locale = msg.locale ?? "en";
  const { subject, body } = render(msg.template, locale, msg.data);
  const [row] = await db
    .insert(outbox)
    .values({ to: msg.to.toLowerCase(), template: msg.template, locale, subject, body, channel: msg.channel ?? "email", data: msg.data as Record<string, unknown>, test: msg.test ?? false })
    .returning();
  if (process.env.NODE_ENV !== "production") console.info(`[outbox] ${msg.to}: ${subject}`);
  return row;
}

export async function latestTo(db: DB, to: string, limit = 20) {
  return db.select().from(outbox).where(eq(outbox.to, to.toLowerCase())).orderBy(desc(outbox.createdAt)).limit(limit);
}
