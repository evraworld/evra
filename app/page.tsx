import { redirect } from "next/navigation";

// The app starts at Home; signed-out visitors are sent on to sign in from there.
export default function Root() {
  redirect("/home");
}
