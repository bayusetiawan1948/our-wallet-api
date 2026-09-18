import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  NewTransfer,
  Transfer,
  transfers,
  Wallet,
  wallets,
} from '../../shared/database/schema';

@Injectable()
export class TransfersRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async CreateTransfer(data: NewTransfer): Promise<Transfer> {
    const [created] = await this.db.insert(transfers).values(data).returning();

    return created;
  }

  async FindById(id: string): Promise<Transfer | undefined> {
    const [found] = await this.db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id))
      .limit(1);

    return found;
  }

  async FindByWalletIds(walletIds: string[]): Promise<Transfer[]> {
    if (walletIds.length === 0) {
      return [];
    }

    const conditions = walletIds.flatMap((id) => [
      eq(transfers.fromWalletId, id),
      eq(transfers.toWalletId, id),
    ]);

    return this.db
      .select()
      .from(transfers)
      .where(or(...conditions));
  }

  async UpdateStatus(
    id: string,
    status: 'active' | 'void',
  ): Promise<Transfer | undefined> {
    const [updated] = await this.db
      .update(transfers)
      .set({ status })
      .where(eq(transfers.id, id))
      .returning();

    return updated;
  }

  async FindWalletById(id: string): Promise<Wallet | undefined> {
    const [found] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1);

    return found;
  }

  async IsWalletInHousehold(
    walletId: string,
    householdId: string,
  ): Promise<boolean> {
    const [found] = await this.db
      .select({ id: wallets.id })
      .from(wallets)
      .where(
        and(
          eq(wallets.id, walletId),
          eq(wallets.ownerHouseholdId, householdId),
        ),
      )
      .limit(1);

    return Boolean(found);
  }
}
