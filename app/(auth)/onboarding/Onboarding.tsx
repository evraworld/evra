"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/db/schema";
import { onboardingStrings } from "@/lib/i18n/onboarding";
import { core } from "@/lib/i18n/core";

type Role = "creator" | "brand" | "manager";
type Account = { platform: "instagram" | "tiktok" | "youtube"; handle: string; followers: number; source: "self" | "demo" | "public"; avgViews?: number; captions?: string[] };
const NICHES = ["beauty", "fashion", "food", "fitness", "tech", "travel", "gaming", "parenting", "lifestyle", "finance"];
const TYPES = ["paid_collab", "seeding", "event", "feedback_call", "licence"] as const;
const HELP = ["content", "reach", "events", "product_feedback", "community"] as const;
const PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

async function call(body: unknown) {
  const res = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

function toggle<T>(list: T[], v: T, max = 99) {
  return list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v];
}

function ChipSet<T extends string>({ legend, options, value, onChange, label, max }: { legend: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void; label: (v: T) => string; max?: number }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="ev-stack">
      <legend className="ev-label" style={{ marginBottom: 10 }}>
        {legend}
      </legend>
      <div className="ev-chips">
        {options.map((o) => (
          <label className="ev-chip" key={o}>
            <input type="checkbox" checked={value.includes(o)} onChange={() => onChange(toggle(value, o, max))} />
            <span>{label(o)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Onboarding({ locale, email, demo }: { locale: Locale; email: string; demo: boolean }) {
  const t = onboardingStrings(locale);
  const c = core(locale).common;
  const [role, setRole] = useState<Role | null>(null);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleState, setHandleState] = useState<"idle" | "ok" | "taken" | "invalid">("idle");
  const [country, setCountry] = useState<"AE" | "IN" | "SA" | "OTHER">("AE");
  const [city, setCity] = useState("");
  const [adult, setAdult] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [website, setWebsite] = useState(email.includes("@") ? email.split("@")[1] : "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([{ platform: "instagram", handle: "", followers: 0, source: "self" }]);
  const [niches, setNiches] = useState<string[]>([]);
  const [openTo, setOpenTo] = useState<string[]>(["paid_collab", "seeding"]);
  const [howIHelp, setHowIHelp] = useState<string[]>(["content"]);
  const [minRate, setMinRate] = useState("");
  const [hint, setHint] = useState<{ low: string; high: string; sample: number; illustrative: boolean } | null>(null);
  const [managerEmail, setManagerEmail] = useState("");
  const [copyTypes, setCopyTypes] = useState<string[]>(["paid_collab"]);
  const [blocked, setBlocked] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");

  const steps = role === "creator" ? ["role", "basics", "accounts", "work", "extras", "kit"] : role === "brand" ? ["role", "basics", "website"] : ["role", "basics"];
  const step = steps[i];
  const biggest = Math.max(0, ...accounts.map((a) => a.followers));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (step !== "work" || !niches[0] || !biggest) return;
    call({ action: "rate-hint", niche: niches[0], country, followers: biggest })
      .then((r) => setHint(r.none ? null : r))
      .catch(() => setHint(null));
  }, [step, niches, country, biggest]);

  // The kit draft starts when the creator moves onto the last step, so it runs once per click, not from an effect.
  function next() {
    setI(i + 1);
    if (steps[i + 1] !== "kit" || headline) return;
    const main = [...accounts].sort((a, b) => b.followers - a.followers)[0];
    run(async () => {
      const d = await call({ action: "kit-draft", name, handle, platform: main.platform, followers: main.followers, avgViews: main.avgViews ?? Math.round(main.followers * 0.8), city, captions: main.captions ?? [] });
      setHeadline(d.headline);
      setBio(d.bio);
      if (!niches.length) setNiches(d.niches.filter((n: string) => NICHES.includes(n)).slice(0, 4));
    });
  }

  async function checkHandle(h: string) {
    if (!h) return setHandleState("idle");
    const r = await call({ action: "handle", handle: h }).catch(() => null);
    if (!r) return;
    setHandle(r.handle);
    setHandleState(!r.valid ? "invalid" : r.available ? "ok" : "taken");
  }

  const canNext = (() => {
    if (step === "role") return !!role;
    if (step === "basics") return name.trim().length >= 2 && adult && (role !== "creator" || handleState === "ok") && (role !== "brand" || brandName.trim().length >= 2);
    if (step === "accounts") return accounts.some((a) => a.handle.trim() && a.followers > 0);
    if (step === "work") return niches.length > 0 && openTo.length > 0 && Number(minRate) >= 0 && minRate !== "";
    if (step === "kit") return headline.trim().length > 0 && bio.trim().length > 0;
    return true;
  })();

  function finish() {
    run(async () => {
      const base = { name, country, adult: true as const };
      const data =
        role === "creator"
          ? { ...base, role, handle, city: city || undefined, accounts: accounts.filter((a) => a.handle.trim() && a.followers > 0).map(({ platform, handle, followers, source }) => ({ platform, handle, followers, source })), niches, openTo, howIHelp, minRateCents: Math.round(Number(minRate) * 100), blockedBrands: blocked.split(",").map((x) => x.trim()).filter(Boolean), manager: managerEmail ? { email: managerEmail, copyTypes } : undefined, headline, bio }
          : role === "brand"
            ? { ...base, role, brandName, website: website || undefined, description: description || undefined, category: category || undefined }
            : { ...base, role };
      const { next } = await call({ action: "complete", data });
      window.location.href = next;
    });
  }

  const isLast = i === steps.length - 1;

  return (
    <div className="ev-stack" style={{ ["--gap" as string]: "20px" }}>
      <p className="ev-muted" aria-live="polite">
        {t.step(i + 1, steps.length)}
      </p>

      {step === "role" && (
        <fieldset className="ev-stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 20 }}>
            <h1 className="ev-display">{t.role.title}</h1>
          </legend>
          {(["creator", "brand", "manager"] as const).map((r) => (
            <label key={r} className="ev-choice">
              <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
              <span className="ev-stack" style={{ ["--gap" as string]: "4px" }}>
                <strong className="ev-h2">{t.role[r]}</strong>
                <span className="ev-muted">{t.role[`${r}Hint`]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {step === "basics" && (
        <div className="ev-stack">
          <h1 className="ev-display">{t.basics.title}</h1>
          <div className="ev-sheet ev-stack">
            <div className="ev-field">
              <label className="ev-label" htmlFor="name">
                {t.basics.name}
              </label>
              <input id="name" className="ev-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {role === "creator" && (
              <div className="ev-field">
                <label className="ev-label" htmlFor="handle">
                  {t.basics.handle}
                </label>
                <span className="ev-hint" id="handle-hint">
                  {t.basics.handleHint}
                </span>
                <div className="ev-row" style={{ ["--gap" as string]: "0" }}>
                  <span className="ev-muted" style={{ paddingInlineEnd: 6 }} dir="ltr">
                    evra.world/@
                  </span>
                  <input id="handle" dir="ltr" className="ev-input" style={{ flex: 1, minWidth: 140 }} autoCapitalize="none" autoComplete="username" value={handle} aria-describedby="handle-hint handle-state" aria-invalid={handleState === "taken" || handleState === "invalid" || undefined} onChange={(e) => { setHandle(e.target.value); setHandleState("idle"); }} onBlur={(e) => checkHandle(e.target.value)} />
                </div>
                <span id="handle-state" className={handleState === "ok" ? "ev-hint" : "ev-error"} aria-live="polite">
                  {handleState === "ok" ? `evra.world/@${handle}` : handleState === "taken" ? t.basics.taken : handleState === "invalid" ? "Use 3 to 30 letters, numbers, dots or underscores." : ""}
                </span>
              </div>
            )}
            {role === "brand" && (
              <div className="ev-field">
                <label className="ev-label" htmlFor="brandName">
                  {t.basics.brandName}
                </label>
                <input id="brandName" className="ev-input" autoComplete="organization" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
              </div>
            )}
            <div className="ev-field">
              <label className="ev-label" htmlFor="country">
                {t.basics.country}
              </label>
              <select id="country" className="ev-select" value={country} onChange={(e) => setCountry(e.target.value as typeof country)}>
                {(["AE", "IN", "SA", "OTHER"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t.countries[k]}
                  </option>
                ))}
              </select>
            </div>
            {role === "creator" && (
              <div className="ev-field">
                <label className="ev-label" htmlFor="city">
                  {t.basics.city} <span className="ev-muted">({c.optional})</span>
                </label>
                <input id="city" className="ev-input" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            )}
            <label className="ev-toggle">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
              <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                <span className="ev-label">{t.basics.adult}</span>
                <span className="ev-hint">{t.basics.adultHint}</span>
              </span>
            </label>
          </div>
        </div>
      )}

      {step === "accounts" && (
        <div className="ev-stack">
          <h1 className="ev-display">{t.accounts.title}</h1>
          <p className="ev-muted">{t.accounts.lead}</p>
          {accounts.map((a, idx) => (
            <div key={idx} className="ev-sheet ev-stack">
              <div className="ev-field">
                <label className="ev-label" htmlFor={`platform-${idx}`}>
                  Platform
                </label>
                <select id={`platform-${idx}`} className="ev-select" value={a.platform} onChange={(e) => setAccounts(accounts.map((x, j) => (j === idx ? { ...x, platform: e.target.value as Account["platform"] } : x)))}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p} disabled={accounts.some((x, j) => j !== idx && x.platform === p)}>
                      {PLATFORM_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ev-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <div className="ev-field">
                  <label className="ev-label" htmlFor={`h-${idx}`}>
                    {t.accounts.handle}
                  </label>
                  <input id={`h-${idx}`} dir="ltr" className="ev-input" autoCapitalize="none" value={a.handle} onChange={(e) => setAccounts(accounts.map((x, j) => (j === idx ? { ...x, handle: e.target.value } : x)))} />
                </div>
                <div className="ev-field">
                  <label className="ev-label" htmlFor={`f-${idx}`}>
                    {t.accounts.followers}
                  </label>
                  <input id={`f-${idx}`} className="ev-input" inputMode="numeric" value={a.followers || ""} onChange={(e) => setAccounts(accounts.map((x, j) => (j === idx ? { ...x, followers: Number(e.target.value.replace(/\D/g, "")), source: "self" } : x)))} />
                </div>
              </div>
              <div className="ev-row">
                {a.platform === "instagram" && (
                  <button type="button" className="ev-btn ev-btn--soft ev-btn--small" disabled={busy || !a.handle} onClick={() => run(async () => { const s = await call({ action: "account-stats", platform: a.platform, handle: a.handle, mode: "public" }); setAccounts(accounts.map((x, j) => (j === idx ? { ...x, followers: s.followers, avgViews: s.avgViews, captions: s.captions, source: "public" } : x))); })}>
                    {busy ? t.accounts.fetching : t.accounts.fetch}
                  </button>
                )}
                {demo && (
                  <button type="button" className="ev-btn ev-btn--soft ev-btn--small" disabled={busy || !a.handle} onClick={() => run(async () => { const s = await call({ action: "account-stats", platform: a.platform, handle: a.handle, mode: "demo" }); setAccounts(accounts.map((x, j) => (j === idx ? { ...x, followers: s.followers, avgViews: s.avgViews, source: "demo" } : x))); })}>
                    {t.accounts.demo}
                  </button>
                )}
                {a.source !== "self" && <span className="ev-badge">{a.source === "demo" ? c.demoData : "Public profile"}</span>}
              </div>
            </div>
          ))}
          {accounts.length < 3 && (
            <button type="button" className="ev-btn ev-btn--secondary" onClick={() => setAccounts([...accounts, { platform: PLATFORMS.find((p) => !accounts.some((a) => a.platform === p))!, handle: "", followers: 0, source: "self" }])}>
              {t.accounts.add}
            </button>
          )}
          <p className="ev-hint">{demo ? `${t.accounts.selfNote} ${t.accounts.demoHint}` : t.accounts.selfNote}</p>
        </div>
      )}

      {step === "work" && (
        <div className="ev-stack">
          <h1 className="ev-display">{t.work.title}</h1>
          <div className="ev-sheet ev-stack" style={{ ["--gap" as string]: "24px" }}>
            <ChipSet legend={t.work.openTo} options={TYPES} value={openTo as (typeof TYPES)[number][]} onChange={setOpenTo} label={(o) => t.types[o]} />
            <ChipSet legend={t.work.help} options={HELP} value={howIHelp as (typeof HELP)[number][]} onChange={setHowIHelp} label={(o) => t.helpTags[o]} />
            <ChipSet legend={t.work.niches} options={NICHES} value={niches} onChange={setNiches} label={(o) => o[0].toUpperCase() + o.slice(1)} max={4} />
            <div className="ev-field">
              <label className="ev-label" htmlFor="minRate">
                {t.work.minRate}
              </label>
              <span className="ev-hint" id="minRate-hint">
                {t.work.minRateHint}
              </span>
              <input id="minRate" className="ev-input" inputMode="decimal" value={minRate} aria-describedby="minRate-hint rate-guidance" onChange={(e) => setMinRate(e.target.value.replace(/[^0-9.]/g, ""))} />
              {hint && (
                <p id="rate-guidance" className="ev-notice" aria-live="polite">
                  <span>
                    {t.work.guidance(hint.low, hint.high, hint.sample)} {hint.illustrative && <span className="ev-muted">{t.work.illustrative}</span>}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === "extras" && (
        <div className="ev-stack">
          <h1 className="ev-display">{t.extras.title}</h1>
          <div className="ev-sheet ev-stack" style={{ ["--gap" as string]: "24px" }}>
            <div className="ev-field">
              <label className="ev-label" htmlFor="manager">
                {t.extras.manager} <span className="ev-muted">({c.optional})</span>
              </label>
              <span className="ev-hint">{t.extras.managerHint}</span>
              <input id="manager" type="email" className="ev-input" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} />
            </div>
            {managerEmail && <ChipSet legend={t.extras.copyTypes} options={TYPES} value={copyTypes as (typeof TYPES)[number][]} onChange={setCopyTypes} label={(o) => t.types[o]} />}
            <div className="ev-field">
              <label className="ev-label" htmlFor="blocked">
                {t.extras.blocked} <span className="ev-muted">({c.optional})</span>
              </label>
              <span className="ev-hint">{t.extras.blockedHint}</span>
              <input id="blocked" className="ev-input" value={blocked} onChange={(e) => setBlocked(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {step === "kit" && (
        <div className="ev-stack">
          <h1 className="ev-display">{t.kit.title}</h1>
          <p className="ev-muted">{t.kit.lead}</p>
          <div className="ev-sheet ev-stack" aria-busy={busy}>
            {busy && !headline ? (
              <p aria-live="polite">{t.kit.drafting}</p>
            ) : (
              <>
                <div className="ev-field">
                  <label className="ev-label" htmlFor="headline">
                    {t.kit.headline}
                  </label>
                  <input id="headline" className="ev-input" maxLength={120} value={headline} onChange={(e) => setHeadline(e.target.value)} />
                </div>
                <div className="ev-field">
                  <label className="ev-label" htmlFor="bio">
                    {t.kit.bio}
                  </label>
                  <textarea id="bio" className="ev-textarea" maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {step === "website" && (
        <div className="ev-stack">
          <h1 className="ev-display">{t.website.title}</h1>
          <div className="ev-sheet ev-stack">
            <div className="ev-field">
              <label className="ev-label" htmlFor="website">
                {t.website.url}
              </label>
              <input id="website" dir="ltr" className="ev-input" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <button type="button" className="ev-btn ev-btn--soft" disabled={busy || !website} onClick={() => run(async () => { const p = await call({ action: "brand-profile", website }); setDescription(p.description); setCategory(p.category); if (!brandName) setBrandName(p.name); })}>
              {busy ? t.website.reading : t.website.read}
            </button>
            <div className="ev-field">
              <label className="ev-label" htmlFor="description">
                {t.website.description}
              </label>
              <textarea id="description" className="ev-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="ev-field">
              <label className="ev-label" htmlFor="category">
                {t.website.category}
              </label>
              <input id="category" className="ev-input" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="ev-notice ev-notice--bad" role="alert">
          {error}
        </p>
      )}

      <div className="ev-spread">
        {i > 0 ? (
          <button type="button" className="ev-btn ev-btn--secondary" onClick={() => setI(i - 1)} disabled={busy}>
            {c.back}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="ev-btn" disabled={!canNext || busy} onClick={() => (isLast ? finish() : next())}>
          {isLast ? (role === "creator" ? (busy ? t.kit.publishing : t.kit.publish) : t.finish.brand) : c.next}
        </button>
      </div>
    </div>
  );
}
