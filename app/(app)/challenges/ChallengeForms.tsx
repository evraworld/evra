"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { challengeStrings } from "@/lib/i18n/challenges";
import { formatMoney } from "@/lib/money";
import { postJson } from "@/components/requests/postJson";
import { Field, Input, Textarea } from "@/components/ui";

export function ChallengeForm({ locale }: { locale: Locale }) {
  const t = challengeStrings(locale).form;
  const id = useId();
  const router = useRouter();
  const [f, setF] = useState({ title: "", brief: "", price: "100", slots: "5", cap: "1" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const priceCents = Math.round(Number(f.price) * 100) || 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { next } = await postJson<{ next: string }>("/api/challenges", { action: "create", title: f.title, brief: f.brief, pricePerEntryCents: priceCents, slots: Number(f.slots), perCreatorCap: Number(f.cap) });
      router.push(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="ev-stack">
      <h2 className="ev-h2">{t.title}</h2>
      <Field id={`${id}-t`} label={t.name}>
        <Input id={`${id}-t`} value={f.title} onChange={set("title")} placeholder={t.namePh} required minLength={3} maxLength={80} />
      </Field>
      <Field id={`${id}-b`} label={t.brief} hint={t.briefHint}>
        <Textarea id={`${id}-b`} aria-describedby={`${id}-b-hint`} value={f.brief} onChange={set("brief")} required minLength={20} maxLength={2000} rows={4} />
      </Field>
      <div className="ev-grid">
        <Field id={`${id}-p`} label={t.price}>
          <Input id={`${id}-p`} type="number" inputMode="decimal" min={10} max={5000} step="0.01" value={f.price} onChange={set("price")} required />
        </Field>
        <Field id={`${id}-s`} label={t.slots}>
          <Input id={`${id}-s`} type="number" inputMode="numeric" min={1} max={200} value={f.slots} onChange={set("slots")} required />
        </Field>
        <Field id={`${id}-c`} label={t.cap}>
          <Input id={`${id}-c`} type="number" inputMode="numeric" min={1} max={10} value={f.cap} onChange={set("cap")} required />
        </Field>
      </div>
      <p className="ev-hint">{t.total(formatMoney(priceCents * (Number(f.slots) || 0)))}</p>
      {error && (
        <p className="ev-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="ev-btn" disabled={busy} aria-busy={busy}>
          {t.submit}
        </button>
      </div>
    </form>
  );
}

export function EntryForm({ challengeId, locale }: { challengeId: string; locale: Locale }) {
  const t = challengeStrings(locale).enter;
  const id = useId();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await postJson("/api/challenges", { action: "enter", challengeId, url: url.trim() });
      setUrl("");
      setMsg({ ok: true, text: t.sent });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="ev-stack">
      <h2 className="ev-h2">{t.title}</h2>
      <Field id={id} label={t.link} hint={t.hint}>
        <Input id={id} aria-describedby={`${id}-hint`} type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={500} />
      </Field>
      <p aria-live="polite" className={msg ? (msg.ok ? "ev-notice ev-notice--ok" : "ev-notice ev-notice--bad") : undefined}>
        {msg?.text}
      </p>
      <div>
        <button className="ev-btn" disabled={busy} aria-busy={busy}>
          {t.submit}
        </button>
      </div>
    </form>
  );
}
