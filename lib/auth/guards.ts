import { redirect } from "next/navigation";
import { currentUser, type User } from "./session";
import { isStaffEmail } from "@/lib/users";

export const isStaff = (u: User) => u.staff || isStaffEmail(u.email);

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/signin");
  return u;
}

export async function requireOnboarded(): Promise<User> {
  const u = await requireUser();
  if (!u.role || !u.onboardedAt) redirect(isStaff(u) ? "/ops" : "/onboarding");
  return u;
}

export async function requireStaff(): Promise<User> {
  const u = await requireUser();
  if (!isStaff(u)) redirect("/home");
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Route handlers and server actions use these instead of redirects.
export async function apiUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Sign in first.");
  return u;
}

export async function apiStaff(): Promise<User> {
  const u = await apiUser();
  if (!isStaff(u)) throw new HttpError(403, "Staff only.");
  return u;
}
