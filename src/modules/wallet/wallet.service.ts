import type { Pool, PoolConnection } from "mysql2/promise";
import { Wallet } from "./wallet.domain.js";
import { WalletRepository } from "./wallet.repository.js";

type RepositoryFactory = (connection: PoolConnection) => WalletRepository;

export class WalletService {
  constructor(
    private readonly pool: Pool,
    private readonly repositoryFactory: RepositoryFactory = (connection) =>
      new WalletRepository(connection),
  ) {}

  async transfer(senderUserId: number, recipientUserId: number, amountMinor: number) {
    if (senderUserId === recipientUserId)
      throw new Error("sender and recipient cannot be the same");

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new Error("amount must be a positive integer number");

    const firstUserId = Math.min(senderUserId, recipientUserId);
    const secondUserId = Math.max(senderUserId, recipientUserId);
    const connection = await this.pool.getConnection();
    const walletRepository = this.repositoryFactory(connection);

    try {
      await connection.beginTransaction();

      const firstRow = await walletRepository.findByUserIdForUpdate(firstUserId);

      const secondRow = await walletRepository.findByUserIdForUpdate(secondUserId);

      const senderRow = firstUserId === senderUserId ? firstRow : secondRow;

      const recipientRow = firstUserId === recipientUserId ? firstRow : secondRow;

      if (!senderRow) throw new Error("sender wallet not found");
      if (!recipientRow) throw new Error("recipient wallet not found");

      const senderWallet = new Wallet(senderRow.balance_minor);
      const recipientWallet = new Wallet(recipientRow.balance_minor);

      const debitedSenderWallet = senderWallet.debit(amountMinor);
      const creditedRecipientWallet = recipientWallet.credit(amountMinor);

      await walletRepository.updateBalance(
        senderRow.id,
        debitedSenderWallet.balanceMinor,
      );

      await walletRepository.updateBalance(
        recipientRow.id,
        creditedRecipientWallet.balanceMinor,
      );

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}
