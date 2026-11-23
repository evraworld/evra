import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { collectiveView } from "@/lib/collectives";
import { getPrefs } from "@/lib/i18n";
import { collectiveStrings } from "@/lib/i18n/collectives";
import { Badge, Money, Notice, PageHeader, Sheet } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { PostForm } from "../CollectiveForms";

export const metadata: Metadata = { title: "Collective | EVRA" };

export default async function CollectivePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireOnboarded();
  const { slug } = await params;
  const db = await getDb();
  const view = await collectiveView(db, slug, user.id);
  if (!view) notFound();
  const { collective: c, me, canModerate, memberCount, posts, members, pending, opportunities } = view;
  const { locale, currency } = await getPrefs(user.locale);
  const t = collectiveStrings(locale);
  const p = t.page;
  const api = `/api/collectives/${c.slug}`;
  const active = me?.status === "active";
  const isBrand = user.role === "brand";
  const when = (d: Date) => d.toLocaleDateString(locale === "ar" ? "ar-AE" : locale === "hi" ? "hi-IN" : "en-GB", { day: "numeric", month: "short" });

  return (
    <main className="ev-page ev-page--narrow">
      <PageHeader title={c.name} lead={c.description || undefined} action={<Badge>{t.kinds[c.kind]}</Badge>} />
      <div className="ev-stack" style={{ ["--gap" as string]: "24px" }}>
        <Sheet className="ev-stack" style={{ ["--gap" as string]: "10px" }}>
          <p className="ev-muted">{t.members(memberCount)}</p>
          {c.rules && (
            <>
              <h2 className="ev-h2">{p.rules}</h2>
              <p className="ev-prose" style={{ whiteSpace: "pre-wrap" }}>
                {c.rules}
              </p>
            </>
          )}
          {isBrand ? (
            <p className="ev-hint">{p.brandsReadOnly}</p>
          ) : !me ? (
            <>
              <ActionButton url={api} body={{ action: "join" }}>
                {p.join}
              </ActionButton>
              <span className="ev-hint">{p.joinHint}</span>
            </>
          ) : me.status === "requested" ? (
            <Badge tone="warn">{t.requested}</Badge>
          ) : (
            <div className="ev-row">
              <Badge tone="ok">{t.roles[me.role]}</Badge>
              {me.role !== "owner" && (
                <ActionButton url={api} body={{ action: "leave" }} variant="danger" small confirm={p.leaveConfirm}>
                  {p.leave}
                </ActionButton>
              )}
            </div>
          )}
        </Sheet>

        {canModerate && pending.length > 0 && (
          <section className="ev-stack" aria-labelledby="pending-title">
            <h2 className="ev-h2" id="pending-title">
              {p.pending}
            </h2>
            <ul className="ev-sheet ev-sheet--flush ev-list">
              {pending.map((m) => (
                <li key={m.userId} className="ev-spread">
                  <strong>{m.name}</strong>
                  <div className="ev-row">
                    <ActionButton url={api} body={{ action: "approve", userId: m.userId }} small>
                      {p.approve}
                    </ActionButton>
                    <ActionButton url={api} body={{ action: "decline", userId: m.userId }} variant="secondary" small>
                      {p.decline}
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {active ? (
          <>
            {opportunities.length > 0 && (
              <section className="ev-stack" aria-labelledby="briefs-title">
                <h2 className="ev-h2" id="briefs-title">
                  {p.briefs}
                </h2>
                <ul className="ev-sheet ev-sheet--flush ev-list">
                  {opportunities.map((o) => (
                    <li key={o.id} className="ev-spread">
                      <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
                        <Link className="ev-link" href={`/opportunities/${o.id}`} prefetch={false}>
                          {o.title}
                        </Link>
                        <span className="ev-small ev-muted">{o.brand}</span>
                      </span>
                      <Money cents={o.budgetCents} currency={currency} locale={locale} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="ev-stack" aria-labelledby="feed-title">
              <h2 className="ev-h2" id="feed-title">
                {p.feed}
              </h2>
              <PostForm locale={locale} slug={c.slug} />
              {posts.length === 0 ? (
                <p className="ev-muted">{p.empty}</p>
              ) : (
                <ul className="ev-sheet ev-sheet--flush ev-list">
                  {posts.map(({ post, name }) => (
                    <li key={post.id} className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
                      <div className="ev-spread">
                        <span className="ev-row" style={{ ["--gap" as string]: "6px" }}>
                          <strong>{name}</strong>
                          {post.kind === "ask" && <Badge tone="warn">{p.ask}</Badge>}
                          {post.pinned && <Badge tone="ink">{p.pinned}</Badge>}
                        </span>
                        <span className="ev-small ev-muted">{when(post.createdAt)}</span>
                      </div>
                      <p className="ev-prose" style={{ whiteSpace: "pre-wrap" }}>
                        {post.body}
                      </p>
                      {canModerate && (
                        <ActionButton url={api} body={{ action: post.pinned ? "unpin" : "pin", postId: post.id }} variant="soft" small>
                          {post.pinned ? p.unpin : p.pin}
                        </ActionButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          !isBrand && <Notice title={p.feedPrivate} />
        )}

        <section className="ev-stack" aria-labelledby="members-title">
          <h2 className="ev-h2" id="members-title">
            {p.memberList}
          </h2>
          {members ? (
            <ul className="ev-sheet ev-sheet--flush ev-list">
              {members.map((m) => (
                <li key={m.userId} className="ev-spread">
                  <span className="ev-row" style={{ ["--gap" as string]: "8px" }}>
                    {m.handle ? <Link href={`/@${m.handle}`}>{m.name}</Link> : <span>{m.name}</span>}
                    {m.role !== "member" && <Badge>{t.roles[m.role]}</Badge>}
                  </span>
                  {me?.role === "owner" && m.role !== "owner" && (
                    <ActionButton url={api} body={{ action: m.role === "moderator" ? "demote" : "promote", userId: m.userId }} variant="soft" small>
                      {m.role === "moderator" ? p.demote : p.promote}
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ev-muted">{p.membersHidden}</p>
          )}
        </section>
      </div>
    </main>
  );
}
