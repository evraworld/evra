"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/db/schema";
import { opsStrings } from "@/lib/i18n/ops";
import { Badge, Empty, Field, Sheet } from "@/components/ui";
import { useJson } from "@/components/ui/client";

export type KitItem = {
  id: string;
  platform: string;
  handle: string;
  name: string;
  email: string;
  followers: string | null;
  followersNote: string | null;
  headline: string;
  synopsis: string;
  status: "draft" | "approved" | "invited" | "claimed" | "deleted";
  note: string;
};
type Note = { text: string; bad?: boolean };

const PLATFORM: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X" };
const TONE = { draft: undefined, approved: "ok", invited: "ink", claimed: "ok", deleted: "bad" } as const;

async function call(body: unknown) {
  const res = await fetch("/api/ops/kits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, data } : { ok: false as const, error: (data.error as string) ?? "That didn't work. Try again." };
}

export function KitLauncher({ locale, drafts }: { locale: Locale; drafts: KitItem[] }) {
  const t = opsStrings(locale);
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  // Notes live here, not in the cards, so they survive a card remounting with fresh server data.
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const note = (id: string, n: Note) => setNotes((x) => ({ ...x, [id]: n }));

  async function importRows() {
    setRunning(true);
    setError(null);
    const r = await call({ action: "import", csv });
    if (!r.ok) {
      setError(r.error);
      setRunning(false);
      return;
    }
    const { ids, errors } = r.data as { ids: string[]; errors: string[] };
    setSkipped(errors);
    if (ids.length) setCsv("");
    // One draft per request: reading a public profile can take a minute, and progress stays visible.
    for (const [i, id] of ids.entries()) {
      setProgress(t.kits.drafting(i + 1, ids.length));
      const d = await call({ action: "draft", id });
      note(id, d.ok ? { text: t.kits.drafted } : { text: d.error, bad: true });
    }
    setProgress(ids.length ? t.kits.imported(ids.length) : "");
    setRunning(false);
    router.refresh();
  }

  const active = drafts.filter((d) => d.status !== "claimed" && d.status !== "deleted");
  const closed = drafts.filter((d) => d.status === "claimed" || d.status === "deleted");

  return (
    <div className="ev-stack" style={{ ["--gap" as string]: "24px" }}>
      <Sheet className="ev-stack">
        <Field id="kit-csv" label={t.kits.paste} hint={t.kits.pasteHint}>
          <textarea id="kit-csv" className="ev-textarea" dir="ltr" spellCheck={false} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="instagram,sara.creates,sara@example.com,Sara Ahmed" aria-describedby="kit-csv-hint" />
        </Field>
        <div>
          <button type="button" className="ev-btn" disabled={running || !csv.trim()} aria-busy={running} onClick={importRows}>
            {running ? t.working : t.kits.import}
          </button>
        </div>
        <p aria-live="polite">{progress}</p>
        {error && (
          <p className="ev-error" role="alert">
            {error}
          </p>
        )}
        {skipped.length > 0 && (
          <div className="ev-notice ev-notice--warn">
            <div className="ev-stack" style={{ ["--gap" as string]: "4px" }}>
              <strong>{t.kits.skipped}</strong>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {skipped.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>

      {active.length === 0 ? (
        <Sheet>
          <Empty title={t.kits.none} />
        </Sheet>
      ) : (
        // The key changes whenever the server copy changes, so each card restarts from the saved draft.
        active.map((d) => <DraftCard key={[d.id, d.status, d.name, d.headline, d.synopsis, d.followers].join("|")} d={d} locale={locale} note={notes[d.id]} onNote={(n) => note(d.id, n)} />)
      )}

      {closed.length > 0 && (
        <details className="ev-sheet">
          <summary style={{ padding: "14px 0", cursor: "pointer", fontWeight: 600 }}>
            {t.kits.closed} ({closed.length})
          </summary>
          <ul className="ev-list">
            {closed.map((d) => (
              <li key={d.id} className="ev-spread" style={{ paddingInline: 0 }}>
                <span dir="ltr">
                  @{d.handle} · {PLATFORM[d.platform]}
                </span>
                <span className="ev-row" style={{ ["--gap" as string]: "8px" }}>
                  <Badge tone={TONE[d.status]}>{t.kitStatus[d.status]}</Badge>
                  <span className="ev-muted ev-small">{d.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DraftCard({ d, locale, note, onNote }: { d: KitItem; locale: Locale; note?: Note; onNote: (n: Note) => void }) {
  const t = opsStrings(locale);
  const router = useRouter();
  const { busy, error, setError, post } = useJson();
  const [name, setName] = useState(d.name);
  const [followers, setFollowers] = useState("");
  const [headline, setHeadline] = useState(d.headline);
  const [synopsis, setSynopsis] = useState(d.synopsis);
  const editable = d.status === "draft" || d.status === "approved";
  const dirty = name !== d.name || headline !== d.headline || synopsis !== d.synopsis;
  const id = (f: string) => `${d.id}-${f}`;

  async function act(body: Record<string, unknown>, done: string) {
    if (await post("/api/ops/kits", { id: d.id, ...body })) {
      onNote({ text: done });
      router.refresh();
    }
  }

  return (
    <Sheet className="ev-stack" aria-labelledby={id("title")}>
      <div className="ev-spread">
        <h2 id={id("title")} className="ev-h2">
          <span dir="ltr">@{d.handle}</span> <span className="ev-muted">· {PLATFORM[d.platform]}</span>
        </h2>
        <Badge tone={TONE[d.status]}>{t.kitStatus[d.status]}</Badge>
      </div>
      <p className="ev-muted ev-small">
        <span dir="ltr">{d.email}</span> · {d.note}
      </p>
      <p>
        {t.kits.followers}: <strong>{d.followers ?? t.kits.unknown}</strong> {d.followersNote && <span className="ev-muted ev-small">({d.followersNote})</span>}
      </p>

      {editable ? (
        <>
          <Field id={id("name")} label={t.kits.name}>
            <input id={id("name")} className="ev-input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id={id("followers")} label={t.kits.followers} hint={t.kits.followersHint}>
            <input id={id("followers")} className="ev-input" inputMode="numeric" value={followers} onChange={(e) => setFollowers(e.target.value.replace(/\D/g, ""))} aria-describedby={`${id("followers")}-hint`} />
          </Field>
          <Field id={id("headline")} label={t.kits.headline}>
            <input id={id("headline")} className="ev-input" dir="auto" maxLength={120} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <Field id={id("synopsis")} label={t.kits.synopsis}>
            <textarea id={id("synopsis")} className="ev-textarea" dir="auto" maxLength={400} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
          </Field>
          <div className="ev-row">
            <button type="button" className="ev-btn ev-btn--secondary" disabled={busy || !dirty || !name.trim()} onClick={() => act({ action: "edit", displayName: name, headline, synopsis }, t.kits.saved)}>
              {t.kits.save}
            </button>
            <button type="button" className="ev-btn ev-btn--soft" disabled={busy} onClick={() => act({ action: "draft", followers: followers ? Number(followers) : undefined }, t.kits.drafted)}>
              {t.kits.redraft}
            </button>
            {d.status === "draft" ? (
              <button type="button" className="ev-btn" disabled={busy || dirty} onClick={() => act({ action: "approve" }, t.kits.approved)}>
                {t.kits.approve}
              </button>
            ) : (
              <button type="button" className="ev-btn" disabled={busy || dirty} onClick={() => act({ action: "invite" }, t.kits.invited)}>
                {t.kits.invite}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="ev-h2" dir="auto">
            {d.headline}
          </p>
          <p dir="auto">{d.synopsis}</p>
          <div className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
            <div>
              <button type="button" className="ev-btn ev-btn--secondary" disabled={busy} onClick={() => act({ action: "invite" }, t.kits.invited)} aria-describedby={id("again-hint")}>
                {t.kits.inviteAgain}
              </button>
            </div>
            <span id={id("again-hint")} className="ev-hint">
              {t.kits.inviteAgainHint}
            </span>
          </div>
        </>
      )}

      <div>
        <button
          type="button"
          className="ev-btn ev-btn--danger"
          disabled={busy}
          onClick={() => {
            setError(null);
            if (window.confirm(t.kits.deleteConfirm)) act({ action: "delete" }, t.kits.deleted);
          }}
        >
          {t.kits.delete}
        </button>
      </div>
      <p aria-live="polite" className={note?.bad ? "ev-error" : "ev-muted"}>
        {busy ? t.working : note?.text}
      </p>
      {error && (
        <p className="ev-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
