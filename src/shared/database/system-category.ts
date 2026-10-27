import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { categories } from './schema';

export type DbTx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// Kategori sistem tersembunyi untuk entri otomatis (utang/piutang, investasi).
// Dibuat sekali per household lalu dipakai ulang.
export async function ensureSystemCategory(
  tx: DbTx,
  householdId: string,
  name: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.name, name),
        eq(categories.isSystem, true),
      ),
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await tx
    .insert(categories)
    .values({
      householdId,
      name,
      type: 'both',
      isSystem: true,
      isHidden: true,
    })
    .returning({ id: categories.id });

  return created.id;
}
