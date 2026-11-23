import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getPrefs } from "@/lib/i18n";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = { title: "Set up your account | EVRA" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardedAt) redirect("/home");
  const { locale } = await getPrefs(user.locale);
  return (
    <main className="ev-page ev-page--narrow">
      <Onboarding locale={locale} email={user.email} demo={process.env.NODE_ENV !== "production" || process.env.EVRA_DEMO === "1"} />
    </main>
  );
}
