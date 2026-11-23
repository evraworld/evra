"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { workStrings } from "@/lib/i18n/work";
import { postJson } from "@/components/requests/postJson";

type Options = { niches: string[]; platforms: string[]; deliverables: string[]; audiences: string[]; countries: string[] };

function ChipSet({ legend, options, value, onChange, label }: { legend: string; options: string[]; value: string[]; onChange: (v: string[]) => void; label: (v: string) => ReactNode }) {
  return (
    <fieldset className="ev-stack" style={{ border: 0, padding: 0, margin: 0, ["--gap" as string]: "10px" }}>
      <legend className="ev-label" style={{ marginBottom: 10 }}>
        {legend}
      </legend>
      <div className="ev-chips">
        {options.map((o) => (
          <label className="ev-chip" key={o}>
            <input type="checkbox" checked={value.includes(o)} onChange={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} />
            <span>{label(o)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function useSubmit(url: string, done: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(body: unknown, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await postJson(url, body);
      done();
      setMsg({ ok: true, text: okText });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  const status = (
    <p aria-live="polite" className={msg ? (msg.ok ? "ev-notice ev-notice--ok" : "ev-notice ev-notice--bad") : undefined}>
      {msg?.text}
    </p>
  );
  return { busy, run, status };
}

export function OpportunityForm({ locale, options, collectives }: { locale: Locale; options: Options; collectives: { slug: string; name: string }[] }) {
  const t = workStrings(locale);
  const id = useId();
  const blank = { title: "", brief: "", niches: [] as string[], platforms: ["instagram"], deliverables: [{ type: "reel", count: "1" }], budget: "", slots: "1", country: "", audience: "public", collectiveSlug: "", invite: "", publicTeaser: true };
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((x) => ({ ...x, [k]: v }));
  const { busy, run, status } = useSubmit("/api/opportunities", () => setF(blank));

  function submit(e: FormEvent) {
    e.preventDefault();
    run(
      {
        title: f.title,
        brief: f.brief,
        niches: f.niches,
        platforms: f.platforms,
        deliverables: f.deliverables.map((d) => ({ type: d.type, count: Number(d.count) || 1 })),
        budgetCents: Math.round(Number(f.budget.replace(/[^0-9.]/g, "")) * 100) || 0,
        slots: Number(f.slots) || 1,
        country: f.country || null,
        audience: f.audience,
        collectiveSlug: f.audience === "collective" ? f.collectiveSlug : undefined,
        invite: f.audience === "invite" ? f.invite.split(",").map((x) => x.trim()).filter(Boolean) : [],
        publicTeaser: f.publicTeaser,
      },
      t.form.posted,
    );
  }

  return (
    <form className="ev-stack" style={{ ["--gap" as string]: "20px" }} onSubmit={submit} aria-busy={busy}>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-title`}>
          {t.form.title}
        </label>
        <input id={`${id}-title`} className="ev-input" required maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-brief`}>
          {t.form.brief}
        </label>
        <span className="ev-hint" id={`${id}-brief-hint`}>
          {t.form.briefHint}
        </span>
        <textarea id={`${id}-brief`} className="ev-textarea" required minLength={20} maxLength={4000} aria-describedby={`${id}-brief-hint`} value={f.brief} onChange={(e) => set("brief", e.target.value)} />
      </div>
      <ChipSet legend={t.form.niches} options={options.niches} value={f.niches} onChange={(v) => set("niches", v.slice(0, 4))} label={(o) => t.niches[o] ?? o} />
      <ChipSet legend={t.form.platforms} options={options.platforms} value={f.platforms} onChange={(v) => set("platforms", v)} label={(o) => t.platforms[o as keyof typeof t.platforms]} />
      <fieldset className="ev-stack" style={{ border: 0, padding: 0, margin: 0, ["--gap" as string]: "10px" }}>
        <legend className="ev-label" style={{ marginBottom: 10 }}>
          {t.form.deliverables}
        </legend>
        {f.deliverables.map((d, i) => (
          <div className="ev-row" key={i}>
            <div className="ev-field" style={{ flex: "2 1 160px" }}>
              <label className="ev-label ev-small" htmlFor={`${id}-dt-${i}`}>
                {t.form.type}
              </label>
              <select id={`${id}-dt-${i}`} className="ev-select" value={d.type} onChange={(e) => set("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                {options.deliverables.map((o) => (
                  <option key={o} value={o}>
                    {t.deliverables[o as keyof typeof t.deliverables]}
                  </option>
                ))}
              </select>
            </div>
            <div className="ev-field" style={{ flex: "1 1 90px" }}>
              <label className="ev-label ev-small" htmlFor={`${id}-dc-${i}`}>
                {t.form.count}
              </label>
              <input id={`${id}-dc-${i}`} className="ev-input" type="number" inputMode="numeric" min={1} max={20} value={d.count} onChange={(e) => set("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} />
            </div>
            {f.deliverables.length > 1 && (
              <button type="button" className="ev-btn ev-btn--soft ev-btn--small" style={{ alignSelf: "flex-end" }} onClick={() => set("deliverables", f.deliverables.filter((_, j) => j !== i))}>
                {t.form.remove}
              </button>
            )}
          </div>
        ))}
        {f.deliverables.length < 6 && (
          <button type="button" className="ev-btn ev-btn--secondary ev-btn--small" style={{ alignSelf: "flex-start" }} onClick={() => set("deliverables", [...f.deliverables, { type: "story", count: "1" }])}>
            {t.form.add}
          </button>
        )}
      </fieldset>
      <div className="ev-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="ev-field">
          <label className="ev-label" htmlFor={`${id}-budget`}>
            {t.form.budget}
          </label>
          <span className="ev-hint" id={`${id}-budget-hint`}>
            {t.form.budgetHint}
          </span>
          <input id={`${id}-budget`} className="ev-input" inputMode="decimal" required aria-describedby={`${id}-budget-hint`} value={f.budget} onChange={(e) => set("budget", e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <div className="ev-field">
          <label className="ev-label" htmlFor={`${id}-slots`}>
            {t.form.slots}
          </label>
          <input id={`${id}-slots`} className="ev-input" type="number" inputMode="numeric" min={1} max={500} value={f.slots} onChange={(e) => set("slots", e.target.value)} />
        </div>
        <div className="ev-field">
          <label className="ev-label" htmlFor={`${id}-country`}>
            {t.form.country}
          </label>
          <select id={`${id}-country`} className="ev-select" value={f.country} onChange={(e) => set("country", e.target.value)}>
            <option value="">{t.anywhere}</option>
            {options.countries.map((c) => (
              <option key={c} value={c}>
                {t.countries[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="ev-stack" style={{ border: 0, padding: 0, margin: 0, ["--gap" as string]: "10px" }}>
        <legend className="ev-label" style={{ marginBottom: 10 }}>
          {t.form.audience}
        </legend>
        {options.audiences.map((a) => (
          <label key={a} className="ev-choice">
            <input type="radio" name={`${id}-audience`} checked={f.audience === a} onChange={() => set("audience", a)} />
            <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
              <strong>{t.audience[a as keyof typeof t.audience]}</strong>
              <span className="ev-muted ev-small">{t.audienceHint[a as keyof typeof t.audienceHint]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {f.audience === "collective" && (
        <div className="ev-field">
          <label className="ev-label" htmlFor={`${id}-collective`}>
            {t.form.collective}
          </label>
          <select id={`${id}-collective`} className="ev-select" required value={f.collectiveSlug} onChange={(e) => set("collectiveSlug", e.target.value)}>
            <option value="">{t.form.pickCollective}</option>
            {collectives.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {f.audience === "invite" && (
        <div className="ev-field">
          <label className="ev-label" htmlFor={`${id}-invite`}>
            {t.form.invite}
          </label>
          <span className="ev-hint" id={`${id}-invite-hint`}>
            {t.form.inviteHint}
          </span>
          <input id={`${id}-invite`} className="ev-input" dir="ltr" required autoCapitalize="none" aria-describedby={`${id}-invite-hint`} value={f.invite} onChange={(e) => set("invite", e.target.value)} />
        </div>
      )}
      <label className="ev-toggle">
        <input type="checkbox" checked={f.publicTeaser} onChange={(e) => set("publicTeaser", e.target.checked)} />
        <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="ev-label">{t.form.teaser}</span>
          <span className="ev-hint">{t.form.teaserHint}</span>
        </span>
      </label>
      <button type="submit" className="ev-btn" disabled={busy} aria-busy={busy}>
        {busy ? t.form.posting : t.form.submit}
      </button>
      {status}
    </form>
  );
}

export function ProfileForm({ locale, brand, countries }: { locale: Locale; brand: { name: string; website: string | null; category: string | null; description: string | null; country: string | null }; countries: string[] }) {
  const t = workStrings(locale);
  const id = useId();
  const [f, setF] = useState({ name: brand.name, website: brand.website ?? "", category: brand.category ?? "", description: brand.description ?? "", country: brand.country ?? "AE" });
  const { busy, run, status } = useSubmit("/api/brand", () => undefined);
  const field = (k: "name" | "website" | "category", label: string, extra: { dir?: "ltr"; inputMode?: "url"; autoComplete?: string } = {}) => (
    <div className="ev-field">
      <label className="ev-label" htmlFor={`${id}-${k}`}>
        {label}
      </label>
      <input id={`${id}-${k}`} className="ev-input" required={k === "name"} maxLength={k === "website" ? 200 : 80} {...extra} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <form
      className="ev-stack"
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        run(f, t.profile.saved);
      }}
    >
      {field("name", t.profile.name, { autoComplete: "organization" })}
      {field("website", t.profile.website, { dir: "ltr", inputMode: "url", autoComplete: "url" })}
      {field("category", t.profile.category)}
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-description`}>
          {t.profile.description}
        </label>
        <textarea id={`${id}-description`} className="ev-textarea" maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-country`}>
          {t.profile.country}
        </label>
        <select id={`${id}-country`} className="ev-select" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
          {countries.map((c) => (
            <option key={c} value={c}>
              {t.countries[c]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="ev-btn" disabled={busy} aria-busy={busy}>
        {busy ? t.profile.saving : t.profile.save}
      </button>
      {status}
    </form>
  );
}
