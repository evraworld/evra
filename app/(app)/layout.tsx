import "@/components/ui/app.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff, requireUser } from "@/lib/auth/guards";
import { getPrefs } from "@/lib/i18n";
import { core } from "@/lib/i18n/core";
import { appFontClasses } from "@/lib/fonts";
import { Nav, type NavItem } from "@/components/app/Nav";
import { Prefs } from "@/components/app/Prefs";
import { SignOut } from "@/components/app/SignOut";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const onboarded = !!(user.role && user.onboardedAt);
  // Staff without a creator or brand account only get Ops; their pages check requireStaff themselves.
  if (!onboarded && !isStaff(user)) redirect("/onboarding");
  const prefs = await getPrefs(user.locale);
  const t = core(prefs.locale);
  const ops: NavItem = { href: "/ops", label: t.nav.ops, icon: "ops" };
  const items: NavItem[] = !onboarded
    ? [ops]
    : user.role === "brand"
      ? [
          { href: "/home", label: t.nav.home, icon: "home" },
          { href: "/creators", label: t.nav.creators, icon: "creators" },
          { href: "/deals", label: t.nav.deals, icon: "deals" },
          { href: "/brand", label: t.nav.brand, icon: "brand" },
        ]
      : [
          { href: "/home", label: t.nav.home, icon: "home" },
          { href: "/opportunities", label: t.nav.work, icon: "work" },
          { href: "/deals", label: t.nav.deals, icon: "deals" },
          { href: "/me", label: t.nav.me, icon: "me" },
        ];
  const extra: NavItem[] = onboarded && isStaff(user) ? [ops] : [];

  return (
    <div className={`evra-app ${appFontClasses}`} data-text={prefs.text} dir={prefs.dir} lang={prefs.locale}>
      <div className="ev-shell">
        <Nav items={items} extra={extra} label={t.nav.main} />
        <div>
          <header className="ev-topbar">
            <Link href="/home" className="ev-wordmark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/company/logo-black.png" alt="EVRA" />
            </Link>
            <div className="ev-row">
              <Prefs locale={prefs.locale} text={prefs.text} labels={t.prefs} />
              <SignOut label={t.prefs.signOut} />
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
