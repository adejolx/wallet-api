import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { WalletRow } from "./wallet.types.js";

export class WalletRepository {
  constructor(private readonly db: Pool | PoolConnection) {}

  async findByUserId(userId: number): Promise<WalletRow | null> {
    if (!Number.isSafeInteger(userId) || userId <= 0)
      throw new Error("user id must be a positive integer number");
    const [rows] = await this.db.execute<WalletRow[]>(
      `SELECT id,
        user_id,
        currency,
        balance_minor,
        created_at,
        updated_at
        FROM wallets WHERE user_id = ?`,
      [userId],
    );
    const [row] = rows;
    return row ?? null;
  }

  async findByUserIdForUpdate(userId: number): Promise<WalletRow | null> {
    if (!Number.isSafeInteger(userId) || userId <= 0)
      throw new Error("user id must be a positive integer number");
    const [rows] = await this.db.execute<WalletRow[]>(
      `SELECT id,
        user_id,
        currency,
        balance_minor,
        created_at,
        updated_at
        FROM wallets WHERE user_id = ?
        FOR UPDATE`,
      [userId],
    );
    const [row] = rows;
    return row ?? null;
  }

  async create(userId: number, currency: string): Promise<WalletRow> {
    if (!Number.isSafeInteger(userId) || userId <= 0)
      throw new Error("user id must be a positive integer number");
    if (!/^[A-Za-z]{3}$/.test(currency))
      throw new Error("a valid 3 letter currency is required");
    const normalizedCurrency = currency.toUpperCase();
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO wallets (user_id, currency) VALUES (?, ?)`,
      [userId, normalizedCurrency],
    );

    const [rows] = await this.db.execute<WalletRow[]>(
      `SELECT id, user_id, currency, balance_minor, created_at, updated_at FROM wallets WHERE id = ?`,
      [result.insertId],
    );
    const [row] = rows;
    if (!row) throw new Error("wallet was created but could not be retrieved");
    return row;
  }

  async updateBalance(walletId: number, balanceMinor: number) {
    if (!Number.isSafeInteger(walletId) || walletId <= 0) {
      throw new Error("wallet id must be a positive integer");
    }

    if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0) {
      throw new Error("balance must be a non-negative safe integer");
    }

    const [result] = await this.db.execute<ResultSetHeader>(
      `UPDATE wallets
        SET balance_minor = ?
        WHERE id = ?`,
      [balanceMinor, walletId],
    );

    if (result.affectedRows === 0) {
      return null;
    }

    const [rows] = await this.db.execute<WalletRow[]>(
      `SELECT id, user_id, currency, balance_minor, created_at, updated_at FROM wallets WHERE id = ?`,
      [walletId],
    );

    const [row] = rows;

    if (!row) throw new Error("Wallet was updated but could not be retrieved");

    return row;
  }
}
