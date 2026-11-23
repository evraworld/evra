import { getDb } from "@/lib/db";
import { latestTo } from "@/lib/messages";
import { devOnly, route } from "@/lib/http";

// Development inbox: lets you (and the end-to-end tests) read sign-in codes without a mail provider.
export const GET = route(async (req) => {
  devOnly();
  const to = new URL(req.url).searchParams.get("to") ?? "";
  return { messages: await latestTo(await getDb(), to) };
});
