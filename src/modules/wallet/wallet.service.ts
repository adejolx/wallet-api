import type { Pool, PoolConnection } from "mysql2/promise";
import { Wallet } from "./wallet.domain.js";
import { WalletRepository } from "./wallet.repository.js";
import { TransactionRepository } from "./transaction.repository.js";
import { IdempotencyRepository } from "./idempotency.repository.js";
import type { IdempotencyKeysRow } from "./wallet.types.js";

type WalletRepositoryFactory = (connection: PoolConnection) => WalletRepository;
type TransactionRepositoryFactory = (
  connection: PoolConnection,
) => TransactionRepository;
type IdempotencyRepositoryFactory = (
  connection: PoolConnection,
) => IdempotencyRepository;

type IdempotencyRecordData = Pick<
  IdempotencyKeysRow,
  "sender_wallet_id" | "recipient_wallet_id" | "amount_minor" | "currency"
>;

export class WalletService {
  constructor(
    private readonly pool: Pool,
    private readonly walletRepositoryFactory: WalletRepositoryFactory = (connection) =>
      new WalletRepository(connection),
    private readonly transactionRepositoryFactory: TransactionRepositoryFactory = (
      connection,
    ) => new TransactionRepository(connection),
    private readonly idempotencyRepositoryFactory: IdempotencyRepositoryFactory = (
      connection,
    ) => new IdempotencyRepository(connection),
  ) {}

  #hasSameIdempotencyPayload(
    src: IdempotencyRecordData,
    target: IdempotencyRecordData,
  ): boolean {
    return (
      src.sender_wallet_id === target.sender_wallet_id &&
      src.recipient_wallet_id === target.recipient_wallet_id &&
      src.amount_minor === target.amount_minor &&
      src.currency === target.currency
    );
  }

  async transfer(
    senderUserId: number,
    recipientUserId: number,
    amountMinor: number,
    idempotencyKey: string,
  ) {
    if (idempotencyKey.trim().length === 0)
      throw new Error("Idempotency key must be a non-empty string");

    if (senderUserId === recipientUserId)
      throw new Error("sender and recipient cannot be the same");

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new Error("amount must be a positive integer number");

    const firstUserId = Math.min(senderUserId, recipientUserId);
    const secondUserId = Math.max(senderUserId, recipientUserId);
    const connection = await this.pool.getConnection();
    const walletRepository = this.walletRepositoryFactory(connection);
    const transactionRepository = this.transactionRepositoryFactory(connection);
    const idempotencyRepository = this.idempotencyRepositoryFactory(connection);

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

      let idempotencyRecord = await idempotencyRepository.findByKey(idempotencyKey);

      if (!idempotencyRecord) {
        try {
          idempotencyRecord = await idempotencyRepository.create({
            idempotencyKey,
            senderWalletId: senderRow.id,
            recipientWalletId: recipientRow.id,
            amountMinor,
            currency: senderRow.currency,
          });
        } catch (err) {
          if (
            err instanceof Error &&
            err.message === "idempotency key already exists"
          ) {
            await connection.rollback();

            const winningRecord = await idempotencyRepository.findByKey(idempotencyKey);

            if (!winningRecord) {
              throw new Error("idempotency record could not be retrieved");
            }

            const samePayload = this.#hasSameIdempotencyPayload(
              {
                sender_wallet_id: senderRow.id,
                recipient_wallet_id: recipientRow.id,
                amount_minor: amountMinor,
                currency: senderRow.currency,
              },
              winningRecord,
            );

            if (samePayload) {
              return;
            }

            throw new Error("idempotency key was already used for a different request");
          }

          throw err;
        }
      } else {
        const samePayload = this.#hasSameIdempotencyPayload(
          {
            sender_wallet_id: senderRow.id,
            recipient_wallet_id: recipientRow.id,
            amount_minor: amountMinor,
            currency: senderRow.currency,
          },
          idempotencyRecord,
        );

        if (samePayload) {
          await connection.commit();
          return;
        }

        throw new Error("idempotency key was already used for a different request");
      }

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

      const transactionRecord = await transactionRepository.create(
        senderRow.id,
        recipientRow.id,
        amountMinor,
        senderRow.currency,
      );

      await idempotencyRepository.setTransactionId(
        idempotencyRecord.id,
        transactionRecord.id,
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
