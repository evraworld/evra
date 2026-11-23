import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { getPrefs } from "@/lib/i18n";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in | EVRA" };

export default async function SignInPage() {
  const user = await currentUser();
  if (user) redirect(user.onboardedAt ? "/home" : "/onboarding");
  const { locale } = await getPrefs();
  return (
    <main className="ev-page ev-page--narrow">
      <SignInForm locale={locale} dev={process.env.NODE_ENV !== "production"} />
    </main>
  );
}
