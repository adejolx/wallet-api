import type { Pool, PoolConnection } from "mysql2/promise";
import { Wallet } from "./wallet.domain.js";
import { WalletRepository } from "./wallet.repository.js";
import { TransactionRepository } from "./transaction.repository.js";

type WalletRepositoryFactory = (connection: PoolConnection) => WalletRepository;
type TransactionRepositoryFactory = (
  connection: PoolConnection,
) => TransactionRepository;

export class WalletService {
  constructor(
    private readonly pool: Pool,
    private readonly walletRepositoryFactory: WalletRepositoryFactory = (connection) =>
      new WalletRepository(connection),
    private readonly transactionRepositoryFactory: TransactionRepositoryFactory = (
      connection,
    ) => new TransactionRepository(connection),
  ) {}

  async transfer(senderUserId: number, recipientUserId: number, amountMinor: number) {
    if (senderUserId === recipientUserId)
      throw new Error("sender and recipient cannot be the same");

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new Error("amount must be a positive integer number");

    const firstUserId = Math.min(senderUserId, recipientUserId);
    const secondUserId = Math.max(senderUserId, recipientUserId);
    const connection = await this.pool.getConnection();
    const walletRepository = this.walletRepositoryFactory(connection);
    const transactionRepository = this.transactionRepositoryFactory(connection);

    try {
      await connection.beginTransaction();

      const firstRow = await walletRepository.findByUserIdForUpdate(firstUserId);

      const secondRow = await walletRepository.findByUserIdForUpdate(secondUserId);

      const senderRow = firstUserId === senderUserId ? firstRow : secondRow;

      const recipientRow = firstUserId === recipientUserId ? firstRow : secondRow;

      if (!senderRow) throw new Error("sender wallet not found");
      if (!recipientRow) throw new Error("recipient wallet not found");
      if (senderRow.currency !== recipientRow.currency)
        throw new Error(
          "A transfer can only move money between wallets of the same currency.",
        );

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

      await transactionRepository.create(
        senderRow.id,
        recipientRow.id,
        amountMinor,
        senderRow.currency,
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
