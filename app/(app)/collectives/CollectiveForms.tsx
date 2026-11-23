"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { collectiveStrings } from "@/lib/i18n/collectives";
import { postJson } from "@/components/requests/postJson";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function CreateCollective({ locale, kinds }: { locale: Locale; kinds: string[] }) {
  const t = collectiveStrings(locale);
  const id = useId();
  const router = useRouter();
  const [f, setF] = useState({ name: "", slug: "", kind: kinds[0], description: "", rules: "", membersVisible: false });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { next } = await postJson<{ next: string }>("/api/collectives", f);
      router.push(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="ev-stack" onSubmit={submit} aria-busy={busy}>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-name`}>
          {t.create.name}
        </label>
        <input id={`${id}-name`} className="ev-input" required minLength={3} maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} />
      </div>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-slug`}>
          {t.create.slug}
        </label>
        <span className="ev-hint" id={`${id}-slug-hint`}>
          {t.create.slugHint}
        </span>
        <input id={`${id}-slug`} className="ev-input" dir="ltr" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" autoCapitalize="none" aria-describedby={`${id}-slug-hint`} value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value.toLowerCase() }); }} />
      </div>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-kind`}>
          {t.create.kind}
        </label>
        <select id={`${id}-kind`} className="ev-select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k as keyof typeof t.kinds]}
            </option>
          ))}
        </select>
      </div>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-description`}>
          {t.create.description}
        </label>
        <textarea id={`${id}-description`} className="ev-textarea" maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-rules`}>
          {t.create.rules}
        </label>
        <textarea id={`${id}-rules`} className="ev-textarea" maxLength={1000} value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value })} />
      </div>
      <label className="ev-toggle">
        <input type="checkbox" checked={f.membersVisible} onChange={(e) => setF({ ...f, membersVisible: e.target.checked })} />
        <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="ev-label">{t.create.membersVisible}</span>
          <span className="ev-hint">{t.create.membersVisibleHint}</span>
        </span>
      </label>
      <button type="submit" className="ev-btn" disabled={busy} aria-busy={busy}>
        {busy ? t.create.working : t.create.submit}
      </button>
      <p className="ev-error" role="alert">
        {error}
      </p>
    </form>
  );
}

export function PostForm({ locale, slug }: { locale: Locale; slug: string }) {
  const t = collectiveStrings(locale).page;
  const id = useId();
  const router = useRouter();
  const [kind, setKind] = useState<"post" | "ask">("post");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/collectives/${slug}`, { action: "post", kind, body: text });
      setText("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ev-sheet ev-stack" onSubmit={submit} aria-busy={busy}>
      <fieldset className="ev-chips" aria-label={t.postLabel}>
        {(["post", "ask"] as const).map((k) => (
          <label className="ev-chip" key={k}>
            <input type="radio" name={`${id}-kind`} checked={kind === k} onChange={() => setKind(k)} />
            <span>{k === "post" ? t.kindPost : t.kindAsk}</span>
          </label>
        ))}
      </fieldset>
      <div className="ev-field">
        <label className="ev-label" htmlFor={`${id}-body`}>
          {t.postLabel}
        </label>
        <span className="ev-hint" id={`${id}-hint`}>
          {t.postHint}
        </span>
        <textarea id={`${id}-body`} className="ev-textarea" required minLength={2} maxLength={2000} aria-describedby={`${id}-hint`} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <button type="submit" className="ev-btn" disabled={busy} aria-busy={busy}>
        {busy ? t.posting : t.post}
      </button>
      <p className="ev-error" role="alert">
        {error}
      </p>
    </form>
  );
}
