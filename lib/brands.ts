import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brandMembers, brands } from "@/lib/db/schema";

export type Brand = typeof brands.$inferSelect;

export async function brandForUser(db: DB, userId: string): Promise<(Brand & { memberRole: string }) | null> {
  const [row] = await db
    .select({ brand: brands, role: brandMembers.role })
    .from(brandMembers)
    .innerJoin(brands, eq(brands.id, brandMembers.brandId))
    .where(eq(brandMembers.userId, userId))
    .limit(1);
  return row ? { ...row.brand, memberRole: row.role } : null;
}
