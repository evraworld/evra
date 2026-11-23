import { getDb } from "@/lib/db";
import { apiUser } from "@/lib/auth/guards";
import { registrationOptions } from "@/lib/auth/passkeys";
import { route } from "@/lib/http";

export const POST = route(async () => registrationOptions(await getDb(), await apiUser()));
