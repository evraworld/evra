import "@/components/ui/app.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import { getPrefs } from "@/lib/i18n";
import { core } from "@/lib/i18n/core";
import { appFontClasses } from "@/lib/fonts";
import { Prefs } from "@/components/app/Prefs";

export default async function Layout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const prefs = await getPrefs(user?.locale);
  const t = core(prefs.locale);
  return (
    <div className={`evra-app ${appFontClasses}`} data-text={prefs.text} dir={prefs.dir} lang={prefs.locale}>
      <header className="ev-topbar">
        <Link href={user?.onboardedAt ? "/home" : "/"} className="ev-wordmark" style={{ visibility: "visible" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/company/logo-black.png" alt="EVRA" />
        </Link>
        <Prefs locale={prefs.locale} text={prefs.text} labels={t.prefs} />
      </header>
      {children}
    </div>
  );
}
