import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOnboarded, HttpError } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { dealStrings } from "@/lib/i18n/deals";
import { dealAccess } from "@/lib/deals/access";
import { dealView, railStep } from "@/lib/deals/view";
import { diffTerms, RIGHT_LABEL, termsTotal } from "@/lib/deals/terms";
import { formatMoney } from "@/lib/money";
import { DELIVERABLE_LABEL } from "@/lib/rates";
import { Badge, KeyValues, Money, Notice, Rail, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { CommentForm, CreatorDispute, Explain, ReviewWork, SubmitWork, TermsEditor } from "./DealClient";

export const metadata: Metadata = { title: "Deal | EVRA" };

const TERRITORY = { worldwide: "Worldwide", region: "One region", country: "One country" };

export default async function DealRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOnboarded();
  const db = await getDb();
  const ctx = await dealAccess(db, id, user).catch((e) => {
    if (e instanceof HttpError) notFound();
    throw e;
  });
  const v = await dealView(db, ctx);
  const { locale, currency } = await getPrefs(user.locale);
  const t = dealStrings(locale);
  const fmt = (c: number) => formatMoney(c, currency, locale);
  const terms = v.current.terms;
  const total = termsTotal(terms);
  const isBrand = v.side === "brand";
  const isCreator = v.side === "creator";
  const other = isBrand ? (v.creator?.name ?? "the creator") : (v.brand?.name ?? "the brand");
  const lastIdx = Math.max(-1, ...v.milestones.map((m) => m.idx));
  const myApproval = isBrand ? v.approvedBy.brand : isCreator ? v.approvedBy.creator : false;
  const proposal = v.agent.find((a) => a.action === "counter" && a.status === "proposed");
  const review = v.agent.find((a) => a.action === "review");
  const reviewOut = review?.output as { summary?: string; redFlags?: { text: string }[]; verdict?: string } | undefined;
  const changes = v.previous ? diffTerms(v.previous.terms, terms) : [];
  const by = (side: string) => (side === "brand" ? (v.brand?.name ?? "Brand") : side === "agent" ? `${v.creator?.name ?? "Creator"}'s agent` : (v.creator?.name ?? "Creator"));

  return (
    <main className="ev-page">
      <header className="ev-head">
        <div className="ev-spread">
          <h1 className="ev-title">{v.deal.title}</h1>
          <Badge tone={v.deal.status === "completed" ? "ok" : v.deal.status === "disputed" ? "bad" : v.deal.status === "active" ? "ink" : undefined}>{t.state[v.deal.status].replace(/\..*$/, "")}</Badge>
        </div>
        <p className="ev-muted">{t.with(other)}</p>
      </header>

      <div className="ev-stack" style={{ ["--gap" as string]: "20px" }}>
        <Sheet tone="ink">
          <div className="ev-stack" style={{ ["--gap" as string]: "14px" }}>
            <Money cents={total} currency={currency} locale={locale} size="hero" />
            <p>{t.state[v.deal.status]}</p>
            <Rail steps={t.rail} current={railStep(v)} label={t.railLabel} />
            <p className="ev-muted ev-small">{isBrand ? t.youPay(fmt(total)) : t.youGet(fmt(total))}</p>
          </div>
        </Sheet>

        {v.deal.status === "negotiating" && v.side !== "staff" && (
          <Sheet>
            <div className="ev-stack">
              <p className="ev-muted">{t.version(v.current.version, by(v.current.proposedBySide))}</p>
              {changes.length > 0 && (
                <Notice title={t.changed}>
                  <ul style={{ paddingInlineStart: 20 }}>
                    {changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {myApproval ? <p>{t.approved} {t.waitingOther}</p> : <ActionButton url={`/api/deals/${id}`} body={{ action: "approve" }}>{t.approve}</ActionButton>}
              <TermsEditor dealId={id} terms={terms} label={t.changeTerms} saveLabel={isBrand ? "Send new terms" : "Send counter"} />
              {isBrand && (
                <ActionButton url={`/api/deals/${id}`} body={{ action: "cancel" }} variant="danger" small confirm="Withdraw this offer?">
                  Withdraw offer
                </ActionButton>
              )}
            </div>
          </Sheet>
        )}

        {isCreator && v.deal.status === "negotiating" && (
          <Sheet>
            <div className="ev-stack">
              <div className="ev-spread">
                <h2 className="ev-h2">{t.agent}</h2>
                <ActionButton url={`/api/deals/${id}`} body={{ action: "agent_review" }} variant="soft" small>
                  {t.agentReview}
                </ActionButton>
              </div>
              <p className="ev-muted ev-small">{t.agentNever}</p>
              {reviewOut?.summary && <p>{reviewOut.summary}</p>}
              {!!reviewOut?.redFlags?.length && (
                <Notice tone="warn" title={t.redFlags}>
                  <ul style={{ paddingInlineStart: 20 }}>
                    {reviewOut.redFlags.map((f) => (
                      <li key={f.text}>{f.text}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {proposal && (
                <div className="ev-notice">
                  <div className="ev-stack">
                    <strong>{t.agentDraft}: {fmt((proposal.output as { totalCents: number }).totalCents)}</strong>
                    <p>{(proposal.output as { message?: string }).message}</p>
                    <div className="ev-row">
                      <ActionButton url={`/api/deals/${id}`} body={{ action: "agent_decide", actionId: proposal.id, approve: true }}>
                        {t.agentSend}
                      </ActionButton>
                      <ActionButton url={`/api/deals/${id}`} body={{ action: "agent_decide", actionId: proposal.id, approve: false }} variant="secondary">
                        {t.agentDismiss}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Sheet>
        )}

        {v.deal.status === "agreed" && isBrand && (
          <Sheet>
            <div className="ev-stack">
              <h2 className="ev-h2">{t.fund}</h2>
              <p className="ev-muted">{t.fundHint}</p>
              <ActionButton url={`/api/deals/${id}`} body={{ action: "start" }}>
                {t.fund}
              </ActionButton>
            </div>
          </Sheet>
        )}

        {v.milestones.length > 0 && (
          <section className="ev-stack" aria-labelledby="work">
            <h2 id="work" className="ev-h2">
              {t.work}
            </h2>
            {v.milestones.map((m) => {
              const subs = v.submissions.filter((s) => s.milestoneIdx === m.idx);
              return (
                <Sheet key={m.id}>
                  <div className="ev-stack">
                    <div className="ev-spread">
                      <strong>
                        {m.idx + 1}. {m.title}
                      </strong>
                      <span className="ev-row">
                        <Money cents={m.amountCents} currency={currency} locale={locale} />
                        <Badge tone={m.status === "released" || m.status === "resolved" ? "ok" : m.status === "disputed" ? "bad" : m.status === "submitted" ? "warn" : undefined}>{t.stepStatus[m.status]}</Badge>
                      </span>
                    </div>
                    {subs.length > 0 && (
                      <ul className="ev-stack" style={{ listStyle: "none", padding: 0, ["--gap" as string]: "6px" }}>
                        {subs.map((s) => (
                          <li key={s.id}>
                            <a className="ev-link" href={s.url} target="_blank" rel="noopener noreferrer">
                              {s.kind === "live" ? t.live : t.draft}
                            </a>{" "}
                            <span className="ev-muted ev-small">{s.createdAt.toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.status === "submitted" && m.reviewDueAt && <p className="ev-hint">{t.reviewHint(terms.reviewDays)} ({m.reviewDueAt.toLocaleDateString()})</p>}
                    {isCreator && v.deal.status === "active" && (m.status === "pending" || m.status === "submitted") && (
                      <>
                        <SubmitWork dealId={id} idx={m.idx} labels={{ send: t.sendWork, link: t.workLink, kind: t.workKind, draft: t.draft, live: t.live }} />
                        {m.status === "submitted" && <CreatorDispute dealId={id} idx={m.idx} labels={{ dispute: t.dispute, why: t.disputeWhy, disputeHint: t.disputeHint }} />}
                      </>
                    )}
                    {isBrand && ["active", "disputed"].includes(v.deal.status) && m.status === "submitted" && (
                      <ReviewWork dealId={id} idx={m.idx} isLast={m.idx === lastIdx} changesLeft={terms.revisions - m.revisionsUsed} labels={{ approve: t.approvePay, live: t.liveConfirm, changes: t.requestChanges, left: t.changesLeft(terms.revisions - m.revisionsUsed), what: t.whatChange, dispute: t.dispute, why: t.disputeWhy, disputeHint: t.disputeHint }} />
                    )}
                  </div>
                </Sheet>
              );
            })}
            {isBrand && v.deal.status === "active" && v.milestones.some((m) => m.status === "pending") && (
              <ActionButton url={`/api/deals/${id}`} body={{ action: "cancel" }} variant="danger" small confirm={t.cancelConfirm}>
                {t.cancel}
              </ActionButton>
            )}
          </section>
        )}

        <Sheet>
          <div className="ev-stack">
            <div className="ev-spread">
              <h2 className="ev-h2">{t.terms}</h2>
              <Explain dealId={id} labels={{ explain: t.explain, explaining: t.explaining, watch: t.redFlags }} />
            </div>
            <KeyValues
              items={[
                [t.deliverables, terms.deliverables.map((d) => `${d.count} x ${DELIVERABLE_LABEL[d.type]} on ${d.platform}`).join(", ")],
                [t.postBy, `${terms.postingWindow.start} to ${terms.postingWindow.end}`],
                [t.rights, terms.usageRights.map((r) => `${RIGHT_LABEL[r.kind]}: ${r.platforms.join(", ")}, ${TERRITORY[r.territory]}, ${r.months} months${r.spendCapCents != null ? `, spend cap ${fmt(r.spendCapCents)}` : ""}${r.priceCents ? `, ${fmt(r.priceCents)}` : ""}`).join("; ")],
                [t.exclusivity, terms.exclusivityDays ? t.days(terms.exclusivityDays) : t.none],
                [t.revisions, String(terms.revisions)],
                [t.killFee, `${terms.killFeeBps / 100}%`],
                [t.payments, terms.milestones.map((m) => `${m.title}: ${fmt(m.amountCents)}`).join("; ")],
                [t.disclosure, terms.disclosure],
                [t.review, t.days(terms.reviewDays)],
              ]}
            />
            <p className="ev-muted ev-small ev-code" dir="ltr">
              Terms fingerprint {v.hash.slice(0, 16)}
            </p>
          </div>
        </Sheet>

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">{t.messages}</h2>
            {v.comments.map((c) => (
              <div key={c.id} className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                <strong className="ev-small">{c.author}</strong>
                <p style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
              </div>
            ))}
            {v.side !== "staff" && <CommentForm dealId={id} labels={{ message: t.message, send: t.send }} />}
          </div>
        </Sheet>

        <Sheet>
          <div className="ev-stack">
            <h2 className="ev-h2">{t.timeline}</h2>
            <ol className="ev-timeline">
              {v.events.map((e) => (
                <li key={e.id}>
                  <strong>{e.kind.replace(/_/g, " ")}</strong> <span className="ev-muted ev-small">{e.actorKind}, {e.createdAt.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        </Sheet>
      </div>
    </main>
  );
}
