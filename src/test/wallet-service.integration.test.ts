import { type RowDataPacket, type ResultSetHeader } from "mysql2";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletRepository } from "../modules/wallet/wallet.repository.js";
import { pool } from "../database/pool.js";
import { WalletService } from "../modules/wallet/wallet.service.js";
import type { PoolConnection } from "mysql2/promise";

type UserRow = RowDataPacket & { id: number; email: string };

describe("Wallet service integration", () => {
  const repository = new WalletRepository(pool),
    service = new WalletService(pool);

  let sender1UserId: number,
    sender2UserId: number,
    recipient1UserId: number,
    recipient2UserId: number;

  beforeEach(async () => {
    const sender1Email = `sender-1-wallet-test-${Date.now()}-${Math.random()}@example.com`;
    const sender2Email = `sender-2-wallet-test-${Date.now()}-${Math.random()}@example.com`;
    const recipient1Email = `recipient-1-wallet-test-${Date.now()}-${Math.random()}@example.com`;
    const recipient2Email = `recipient-2-wallet-test-${Date.now()}-${Math.random()}@example.com`;

    await pool.execute<ResultSetHeader>(
      `INSERT INTO users (email)
      VALUES (?), (?), (?), (?)`,
      [sender1Email, sender2Email, recipient1Email, recipient2Email],
    );

    const [users] = await pool.execute<UserRow[]>(
      `SELECT id, email
      FROM users
      WHERE email IN (?, ?, ?, ?)`,
      [sender1Email, sender2Email, recipient1Email, recipient2Email],
    );

    const ids = new Map(users.map((user) => [user.email, user.id]));

    sender1UserId = ids.get(sender1Email)!;
    sender2UserId = ids.get(sender2Email)!;
    recipient1UserId = ids.get(recipient1Email)!;
    recipient2UserId = ids.get(recipient2Email)!;
  });

  afterEach(async () => {
    await pool.execute(
      `DELETE FROM wallets
      WHERE user_id IN (?, ?, ?, ?)`,
      [sender1UserId, sender2UserId, recipient1UserId, recipient2UserId],
    );

    await pool.execute(
      `DELETE FROM users
      WHERE id IN (?, ?, ?, ?)`,
      [sender1UserId, sender2UserId, recipient1UserId, recipient2UserId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should transfer money between wallets", async () => {
    const transferAmount = 50_000;
    const senderInitBalance = 250_000;
    const currency = "NGN";

    const senderWallet = await repository.create(sender1UserId, currency);
    await repository.create(recipient1UserId, currency);

    await repository.updateBalance(senderWallet.id, senderInitBalance);

    await service.transfer(sender1UserId, recipient1UserId, transferAmount);

    const senderWalletAfterTransfer = await repository.findByUserId(sender1UserId);
    const recipientWalletAfterTransfer =
      await repository.findByUserId(recipient1UserId);

    expect(senderWalletAfterTransfer?.balance_minor).toBe(
      senderInitBalance - transferAmount,
    );
    expect(recipientWalletAfterTransfer?.balance_minor).toBe(transferAmount);
  });

  it("should handle concurrent transfers from a sender to multiple recipients correctly", async () => {
    const transferAmount = 50_000;
    const senderInitBalance = 250_000;
    const currency = "NGN";

    const senderWallet = await repository.create(sender1UserId, currency);
    await repository.create(recipient1UserId, currency);
    await repository.create(recipient2UserId, currency);
    await repository.updateBalance(senderWallet.id, senderInitBalance);

    const trxnService1 = new WalletService(pool);
    const trxnService2 = new WalletService(pool);

    await Promise.all([
      trxnService1.transfer(sender1UserId, recipient1UserId, transferAmount),
      trxnService2.transfer(sender1UserId, recipient2UserId, transferAmount),
    ]);

    const senderWalletAfterTransfer = await repository.findByUserId(sender1UserId);
    const recipientWalletAfterTransfer =
      await repository.findByUserId(recipient1UserId);
    const recipient2WalletAfterTransfer =
      await repository.findByUserId(recipient2UserId);

    expect(senderWalletAfterTransfer?.balance_minor).toBe(
      senderInitBalance - transferAmount * 2,
    );
    expect(recipientWalletAfterTransfer?.balance_minor).toBe(transferAmount);
    expect(recipient2WalletAfterTransfer?.balance_minor).toBe(transferAmount);
  });

  it("should rollback when one transfer fails", async () => {
    const transferAmount = 50_000;
    const senderBalance = 250_000;
    const errorMsg = "simulated recipient update failure";

    const senderWallet = await repository.create(sender1UserId, "NGN");
    await repository.create(recipient1UserId, "NGN");
    await repository.updateBalance(senderWallet.id, senderBalance);

    const service = new WalletService(pool, (connection) => {
      const trxnRepository = new WalletRepository(connection);
      const realUpdateBalance = trxnRepository.updateBalance.bind(trxnRepository);

      vi.spyOn(trxnRepository, "updateBalance")
        .mockImplementationOnce((walletId, balance) =>
          realUpdateBalance(walletId, balance),
        )
        .mockRejectedValueOnce(new Error(errorMsg));

      return trxnRepository;
    });

    await expect(
      service.transfer(sender1UserId, recipient1UserId, transferAmount),
    ).rejects.toThrow(errorMsg);

    const sender = await repository.findByUserId(sender1UserId);
    const recipient = await repository.findByUserId(recipient1UserId);

    expect(sender?.balance_minor).toBe(senderBalance);
    expect(recipient?.balance_minor).toBe(0);
  });

  it("should handle concurrent receives correctly", async () => {
    const transferAmount = 50_000;
    const senderInitBalance = 100_000;
    const currency = "NGN";

    const sender1Wallet = await repository.create(sender1UserId, currency);
    const sender2Wallet = await repository.create(sender2UserId, currency);
    await repository.create(recipient1UserId, currency);
    await repository.updateBalance(sender1Wallet.id, senderInitBalance);
    await repository.updateBalance(sender2Wallet.id, senderInitBalance);

    const service1 = new WalletService(pool);
    const service2 = new WalletService(pool);

    await Promise.all([
      service1.transfer(sender1UserId, recipient1UserId, transferAmount),
      service2.transfer(sender2UserId, recipient1UserId, transferAmount),
    ]);

    const sender1WalletAfter = await repository.findByUserId(sender1UserId);
    const sender2WalletAfter = await repository.findByUserId(sender2UserId);
    const recipient1WalletAfter = await repository.findByUserId(recipient1UserId);

    expect(sender1WalletAfter?.balance_minor).toBe(senderInitBalance - transferAmount);
    expect(sender2WalletAfter?.balance_minor).toBe(senderInitBalance - transferAmount);
    expect(recipient1WalletAfter?.balance_minor).toBe(transferAmount * 2);
  });

  it("should handle deadlocks correctly", async () => {
    const initialBalance = 100_000;
    const currency = "NGN";
    const transferAmountToRecipient = 20_000;
    const transferAmountToSender = 10_000;

    const sender1Wallet = await repository.create(sender1UserId, currency);
    await repository.updateBalance(sender1Wallet.id, initialBalance);

    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    await repository.updateBalance(recipient1Wallet.id, initialBalance);

    const service1 = new WalletService(pool);
    const service2 = new WalletService(pool);

    await Promise.all([
      service1.transfer(sender1UserId, recipient1UserId, transferAmountToRecipient),
      service2.transfer(recipient1UserId, sender1UserId, transferAmountToSender),
    ]);

    const sender1UserWalletAfter = await repository.findByUserId(sender1UserId);
    const recipient1UserWalletAfter = await repository.findByUserId(recipient1UserId);

    expect(sender1UserWalletAfter?.balance_minor).toBe(
      initialBalance - transferAmountToRecipient + transferAmountToSender,
    );
    expect(recipient1UserWalletAfter?.balance_minor).toBe(
      initialBalance + transferAmountToRecipient - transferAmountToSender,
    );
  });
});
