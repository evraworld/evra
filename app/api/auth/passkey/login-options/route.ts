import { getDb } from "@/lib/db";
import { authenticationOptions } from "@/lib/auth/passkeys";
import { route } from "@/lib/http";

export const POST = route(async () => authenticationOptions(await getDb()));
