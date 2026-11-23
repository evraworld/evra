import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { outbox } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// Local development inbox for every message EVRA would send. Not available in production.
export default async function DevOutbox({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  if (process.env.NODE_ENV === "production" && process.env.EVRA_DEV_TOOLS !== "1") notFound();
  const { to } = await searchParams;
  const db = await getDb();
  const q = db.select().from(outbox);
  const rows = await (to ? q.where(eq(outbox.to, to.toLowerCase())) : q).orderBy(desc(outbox.createdAt)).limit(50);
  return (
    <main className="ev-page">
      <h1 className="ev-title">Development inbox</h1>
      <p className="ev-muted">{to ? `Messages sent to ${to}.` : "The last 50 messages EVRA sent."} Production delivers these by email or WhatsApp instead.</p>
      <ul className="ev-sheet ev-sheet--flush ev-list" style={{ marginTop: 20 }}>
        {rows.map((m) => (
          <li key={m.id}>
            <div className="ev-spread">
              <strong>{m.subject}</strong>
              <span className="ev-muted ev-small">
                {m.to}, {m.createdAt.toLocaleString()}
              </span>
            </div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", marginTop: 8 }}>{m.body}</pre>
          </li>
        ))}
        {rows.length === 0 && <li className="ev-muted">Nothing sent yet.</li>}
      </ul>
    </main>
  );
}
