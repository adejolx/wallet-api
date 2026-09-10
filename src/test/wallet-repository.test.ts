import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResultSetHeader } from "mysql2/promise";
import { WalletRepository } from "../modules/wallet/wallet.repository.js";
import { pool } from "../database/pool.js";

describe("WalletRepository", () => {
  const repository = new WalletRepository(pool);

  let userId: number;

  beforeEach(async () => {
    const email = `wallet-test-${Date.now()}-${Math.random()}@example.com`;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users (email)
       VALUES (?)`,
      [email],
    );

    userId = result.insertId;
  });

  afterEach(async () => {
    await pool.execute(
      `DELETE FROM wallets
       WHERE user_id = ?`,
      [userId],
    );

    await pool.execute(
      `DELETE FROM users
       WHERE id = ?`,
      [userId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("findByUserId", () => {
    it("should return a wallet belonging to a user", async () => {
      await pool.execute(
        `INSERT INTO wallets (user_id, currency, balance_minor)
         VALUES (?, ?, ?)`,
        [userId, "NGN", 250000],
      );

      const wallet = await repository.findByUserId(userId);

      expect(wallet).not.toBeNull();
      expect(wallet?.user_id).toBe(userId);
      expect(wallet?.currency).toBe("NGN");
      expect(wallet?.balance_minor).toBe(250000);
    });

    it("should return null when a wallet is missing", async () => {
      const wallet = await repository.findByUserId(userId);

      expect(wallet).toBeNull();
    });
  });

  describe("create", () => {
    it("should create wallet with balance_minor = 0", async () => {
      const wallet = await repository.create(userId, "NGN");

      expect(wallet).toMatchObject({
        user_id: userId,
        currency: "NGN",
        balance_minor: 0,
      });
    });

    it("should normalize currency e.g. ngn to NGN", async () => {
      const wallet = await repository.create(userId, "ngn");

      expect(wallet).toMatchObject({
        user_id: userId,
        currency: "NGN",
      });
    });

    it("should reject wallet duplication for the same user", async () => {
      const wallet = await repository.create(userId, "NGN");
      expect(wallet).toMatchObject({
        user_id: userId,
        currency: "NGN",
      });

      await expect(repository.create(userId, "NGN")).rejects.toMatchObject({
        code: "ER_DUP_ENTRY",
      });
    });
  });

  describe("updateBalance", () => {
    it("should persist new balance for an existing wallet", async () => {
      const wallet = await repository.create(userId, "NGN");
      const updatedWallet = await repository.updateBalance(wallet.id, 4000);

      expect(updatedWallet).not.toBeNull();
      expect(updatedWallet?.balance_minor).toBe(4000);
    });

    it("should return null for a missing wallet", async () => {
      const wallet = await repository.create(userId, "NGN");

      await pool.execute(
        `DELETE FROM wallets
         WHERE id = ?`,
        [wallet.id],
      );

      const updatedWallet = await repository.updateBalance(wallet.id, 4000);

      expect(updatedWallet).toBeNull();
    });

    it("should reject a negative balance", async () => {
      const wallet = await repository.create(userId, "NGN");
      await expect(repository.updateBalance(wallet.id, -4000)).rejects.toThrow(
        "balance must be a non-negative safe integer",
      );
    });
  });
});
