import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/auth/guards";

type Handler<C> = (req: Request, ctx: C) => Promise<Response | object | void>;

// Wraps route handlers so every error reaches the user as plain words and a status code, never a stack trace.
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Check the highlighted fields and try again.", issues: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
    }
  };
}

export async function body(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

export const devOnly = () => {
  if (process.env.NODE_ENV === "production" && process.env.EVRA_DEV_TOOLS !== "1") throw new HttpError(404, "Not found.");
};
