import type { PoolConnection, ResultSetHeader } from "mysql2/promise";

import type { IdempotencyKeysRow } from "./wallet.types.js";

export class IdempotencyRepository {
  constructor(private readonly pool: PoolConnection) {}

  async findByKey(idempotencyKey: string) {
    if (idempotencyKey.trim().length === 0) {
      throw new Error("Idempotency key must be a non-empty string");
    }

    const [result] = await this.pool.execute<IdempotencyKeysRow[]>(
      `SELECT
      id, idempotency_key, sender_wallet_id,
      recipient_wallet_id, amount_minor, currency,
      transaction_id, created_at
      FROM idempotency_keys
      WHERE idempotency_key = ?`,
      [idempotencyKey],
    );

    const [row] = result;

    return row ?? null;
  }

  async findById(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("id must be a positive integer number");

    const [rows] = await this.pool.execute<IdempotencyKeysRow[]>(
      `SELECT
      id, idempotency_key, sender_wallet_id,
      recipient_wallet_id, amount_minor, currency,
      transaction_id, created_at
      FROM idempotency_keys
      WHERE id = ?`,
      [id],
    );

    const [row] = rows;

    if (!row) throw new Error("Idempotency key could not be retrieved");
    return row;
  }

  async create({
    idempotencyKey,
    senderWalletId,
    recipientWalletId,
    amountMinor,
    currency,
  }: {
    idempotencyKey: string;
    senderWalletId: number;
    recipientWalletId: number;
    amountMinor: number;
    currency: string;
  }) {
    if (idempotencyKey.trim().length === 0)
      throw new Error("Idempotency key must be a non-empty string");

    if (!Number.isSafeInteger(senderWalletId) || senderWalletId <= 0)
      throw new Error("sender wallet id must be a positive integer number");

    if (!Number.isSafeInteger(recipientWalletId) || recipientWalletId <= 0)
      throw new Error("recipient wallet id must be a positive integer number");

    if (!/^[A-Za-z]{3}$/.test(currency))
      throw new Error("a valid 3 letter currency is required");

    const normalizedCurrency = currency.toUpperCase();

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new Error("amount must be a positive safe integer");
    }

    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO idempotency_keys (idempotency_key, sender_wallet_id, recipient_wallet_id, amount_minor, currency) VALUES (?, ?, ?, ?, ?)`,
        [
          idempotencyKey,
          senderWalletId,
          recipientWalletId,
          amountMinor,
          normalizedCurrency,
        ],
      );

      return await this.findById(result.insertId);
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ER_DUP_ENTRY")
        throw new Error("idempotency key already exists");

      throw err;
    }
  }

  async setTransactionId(idempotencyId: number, transactionId: number) {
    if (!Number.isSafeInteger(idempotencyId) || idempotencyId <= 0)
      throw new Error("Idempotency id should be a positive safe integer");
    if (!Number.isSafeInteger(transactionId) || transactionId <= 0)
      throw new Error("transaction id should be a positive safe integer");

    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE idempotency_keys SET transaction_id = ? WHERE id = ?`,
      [transactionId, idempotencyId],
    );

    if (result.affectedRows === 0)
      throw new Error("Failed to associate transaction with idempotency record");

    return await this.findById(idempotencyId);
  }
}
