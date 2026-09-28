import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { TransactionRow } from "./wallet.types.js";

export class TransactionRepository {
  constructor(private readonly connection: PoolConnection) {}

  async create(
    senderWalletId: number,
    recipientWalletId: number,
    amountMinor: number,
    currency: string,
  ) {
    if (!Number.isSafeInteger(senderWalletId) || senderWalletId <= 0)
      throw new Error("Sender wallet id must be a valid integer");

    if (!Number.isSafeInteger(recipientWalletId) || recipientWalletId <= 0)
      throw new Error("Recipient wallet id must be a valid integer");

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new Error("Amount must be a positive integer");

    if (!/^[A-Za-z]{3}$/.test(currency))
      throw new Error("a valid 3 letter currency is required");

    const [result] = await this.connection.execute<ResultSetHeader>(
      `INSERT INTO transactions (sender_wallet, recipient_wallet, amount_minor, currency) VALUES (?, ?, ?, ?)`,
      [senderWalletId, recipientWalletId, amountMinor, currency],
    );

    const [rows] = await this.connection.execute<TransactionRow[]>(
      `SELECT id, sender_wallet, recipient_wallet, amount_minor, currency FROM transactions WHERE id = ?`,
      [result.insertId],
    );

    const [row] = rows;

    if (!row) throw new Error("Transaction cannot be retrieved");

    return row;
  }
}
