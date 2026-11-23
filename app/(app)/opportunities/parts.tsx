import type { BrandRecord, FitReason, Opportunity } from "@/lib/opportunities";
import type { workStrings } from "@/lib/i18n/work";
import { Badge } from "@/components/ui";

type T = ReturnType<typeof workStrings>;

// Shared by the feed, the brief page, the brand directory and discovery.
export function RecordLine({ record, t }: { record: BrandRecord; t: T }) {
  const bits = [record.completed ? t.record.completed(record.completed) : t.record.newBrand];
  if (record.medianDaysToRelease != null) bits.push(t.record.days(record.medianDaysToRelease));
  if (record.rating != null) bits.push(t.record.rating(record.rating, record.ratings));
  if (record.completed || record.disputes) bits.push(t.record.disputes(record.disputes));
  return <p className="ev-small ev-muted">{bits.join(" · ")}</p>;
}

export const fitLabel = (r: FitReason, t: T) =>
  r.key === "niche" ? t.fit.niche(t.niches[r.niche] ?? r.niche) : r.key === "country" ? t.fit.country(t.countries[r.country] ?? r.country) : r.key === "budget" ? t.fit.budget : t.fit.engagement(`${(r.bps / 100).toFixed(1)}%`);

export function FitBadges({ reasons, t }: { reasons: FitReason[]; t: T }) {
  if (!reasons.length) return null;
  return (
    <ul className="ev-row" aria-label={t.fit.title} style={{ listStyle: "none", padding: 0, margin: 0, ["--gap" as string]: "6px" }}>
      {reasons.map((r) => (
        <li key={r.key}>
          <Badge tone="ok">{fitLabel(r, t)}</Badge>
        </li>
      ))}
    </ul>
  );
}

export const deliverablesText = (o: Pick<Opportunity, "deliverables">, t: T) => o.deliverables.map((d) => `${d.count} × ${t.deliverables[d.type]}`).join(", ");
export const platformsText = (o: Pick<Opportunity, "platforms">, t: T) => o.platforms.map((p) => t.platforms[p]).join(", ");

// Only http(s) links are rendered; anything else a brand typed stays plain text.
export const safeHref = (url: string | null) => (!url ? null : /^https?:\/\//i.test(url) ? url : /^[a-z][a-z0-9+.-]*:/i.test(url) ? null : `https://${url}`);
