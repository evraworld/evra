import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { getPrefs } from "@/lib/i18n";
import { opsStrings } from "@/lib/i18n/ops";
import { kitData, listDrafts } from "@/lib/ops/kits";
import { fmtDate, fmtNumber, OpsPage } from "../ui";
import { KitLauncher, type KitItem } from "./KitLauncher";

export const metadata: Metadata = { title: "Kit launcher | EVRA Ops" };

export default async function KitsPage() {
  const staff = await requireStaff();
  const { locale } = await getPrefs(staff.locale);
  const t = opsStrings(locale);
  const drafts = await listDrafts(await getDb());
  const items: KitItem[] = drafts.map((d) => {
    const data = kitData(d);
    const src = data.sources?.followers;
    return {
      id: d.id,
      platform: d.platform,
      handle: d.handle,
      name: d.displayName ?? "",
      email: d.email ?? "",
      followers: data.followers ? fmtNumber(data.followers, locale) : null,
      followersNote: src ? `${t.kits.from[src.from]}, ${fmtDate(new Date(src.at), locale)}` : null,
      headline: d.headline ?? "",
      synopsis: d.synopsis ?? "",
      status: d.status,
      note: d.status === "deleted" ? t.kits.deletedBy[data.deleted?.by ?? "staff"] : d.status === "claimed" ? "" : t.kits.deletesOn(fmtDate(d.deleteAfter, locale)),
    };
  });
  return (
    <OpsPage title={t.tools.kits} lead={t.kits.lead} back={t.back}>
      <KitLauncher locale={locale} drafts={items} />
    </OpsPage>
  );
}
