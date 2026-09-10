import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface WalletRow extends RowDataPacket {
  id: number;
  user_id: number;
  currency: string;
  balance_minor: number;
  created_at: Date;
  updated_at: Date;
}

export class WalletRepository {
  constructor(private readonly pool: Pool) {}

  async findByUserId(userId: number): Promise<WalletRow | null> {
    if (!Number.isSafeInteger(userId) || userId <= 0)
      throw new Error("user id must be a positive integer number");
    const [rows] = await this.pool.execute<WalletRow[]>(
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

  async create(userId: number, currency: string): Promise<WalletRow> {
    if (!Number.isSafeInteger(userId) || userId <= 0)
      throw new Error("user id must be a positive integer number");
    if (!/^[A-Za-z]{3}$/.test(currency))
      throw new Error("a valid 3 letter currency is required");
    const normalizedCurrency = currency.toUpperCase();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO wallets (user_id, currency) VALUES (?, ?)`,
      [userId, normalizedCurrency],
    );

    const [rows] = await this.pool.execute<WalletRow[]>(
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

    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE wallets 
        SET balance_minor = ? 
        WHERE id = ?`,
      [balanceMinor, walletId],
    );

    if (result.affectedRows === 0) {
      return null;
    }

    const [rows] = await this.pool.execute<WalletRow[]>(
      `SELECT id, user_id, currency, balance_minor, created_at, updated_at FROM wallets WHERE id = ?`,
      [walletId],
    );

    const [row] = rows;

    if (!row) throw new Error("Wallet was updated but could not be retrieved");

    return row;
  }
}
