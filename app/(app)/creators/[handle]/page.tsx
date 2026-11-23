import { notFound, redirect } from "next/navigation";
import { HANDLE_RE } from "@/lib/users";

// The public kit at /@handle is the one creator page; this keeps /creators/<handle> links working.
export default async function CreatorRedirect({ params }: { params: Promise<{ handle: string }> }) {
  const handle = (await params).handle.replace(/^(@|%40)+/i, "").toLowerCase();
  if (!HANDLE_RE.test(handle)) notFound();
  redirect(`/@${handle}`);
}
