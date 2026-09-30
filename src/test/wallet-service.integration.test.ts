import { type RowDataPacket, type ResultSetHeader } from "mysql2";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletRepository } from "../modules/wallet/wallet.repository.js";
import { pool } from "../database/pool.js";
import { WalletService } from "../modules/wallet/wallet.service.js";
import type {
  IdempotencyKeysRow,
  TransactionRow,
} from "../modules/wallet/wallet.types.js";

type UserRow = RowDataPacket & { id: number; email: string };

describe("Wallet service integration", () => {
  const repository = new WalletRepository(pool);
  let sender1UserId: number,
    sender2UserId: number,
    recipient1UserId: number,
    recipient2UserId: number,
    createdWallets: number[] = [];

  beforeEach(async () => {
    createdWallets = [];
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
    if (createdWallets.length > 0) {
      const placeholders = createdWallets.map(() => "?").join(",");

      await pool.execute(
        `DELETE FROM idempotency_keys WHERE sender_wallet_id IN (${placeholders}) OR recipient_wallet_id IN (${placeholders})`,
        [...createdWallets, ...createdWallets],
      );

      await pool.execute(
        `DELETE FROM transactions
        WHERE sender_wallet IN (${placeholders}) OR recipient_wallet IN (${placeholders})`,
        [...createdWallets, ...createdWallets],
      );

      await pool.execute(
        `DELETE FROM wallets
        WHERE user_id IN (?, ?, ?, ?)`,
        [sender1UserId, sender2UserId, recipient1UserId, recipient2UserId],
      );
    }

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
    const recipientWallet = await repository.create(recipient1UserId, currency);
    createdWallets.push(senderWallet.id, recipientWallet.id);

    await repository.updateBalance(senderWallet.id, senderInitBalance);

    const service = new WalletService(pool);
    await service.transfer({
      senderUserId: sender1UserId,
      recipientUserId: recipient1UserId,
      amountMinor: transferAmount,
      idempotencyKey: "transfer-1",
    });
    const [rows] = await pool.execute<TransactionRow[]>(
      `SELECT sender_wallet, recipient_wallet, amount_minor, currency FROM transactions WHERE sender_wallet = ? AND recipient_wallet = ?`,
      [senderWallet.id, recipientWallet.id],
    );
    expect(rows).toHaveLength(1);
    const [row] = rows;

    expect(row?.sender_wallet).toEqual(senderWallet.id);
    expect(row?.recipient_wallet).toEqual(recipientWallet.id);
    expect(row?.amount_minor).toEqual(transferAmount);
    expect(row?.currency).toEqual(currency);

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
    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    const recipient2Wallet = await repository.create(recipient2UserId, currency);
    await repository.updateBalance(senderWallet.id, senderInitBalance);
    createdWallets.push(senderWallet.id, recipient1Wallet.id, recipient2Wallet.id);

    const trxnService1 = new WalletService(pool);
    const trxnService2 = new WalletService(pool);

    await Promise.all([
      trxnService1.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "transfer-1",
      }),
      trxnService2.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient2UserId,
        amountMinor: transferAmount,
        idempotencyKey: "transfer-2",
      }),
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
    const currency = "NGN";

    const senderWallet = await repository.create(sender1UserId, currency);
    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    await repository.updateBalance(senderWallet.id, senderBalance);
    createdWallets.push(senderWallet.id, recipient1Wallet.id);

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
      service.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "transfer-1",
      }),
    ).rejects.toThrow(errorMsg);

    const sender = await repository.findByUserId(sender1UserId);
    const recipient = await repository.findByUserId(recipient1UserId);

    expect(sender?.balance_minor).toBe(senderBalance);
    expect(recipient?.balance_minor).toBe(0);
  });

  it("should rollback the transaction when a transfer fails", async () => {
    const transferAmount = 50_000;
    const senderBalance = 250_000;
    const errorMsg = "simulated recipient update failure";
    const currency = "NGN";

    const senderWallet = await repository.create(sender1UserId, currency);
    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    await repository.updateBalance(senderWallet.id, senderBalance);
    createdWallets.push(senderWallet.id, recipient1Wallet.id);

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
      service.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "transfer-1",
      }),
    ).rejects.toThrow(errorMsg);

    const [transactionRows] = await pool.execute<TransactionRow[]>(
      `SELECT sender_wallet, recipient_wallet, amount_minor, currency FROM transactions WHERE sender_wallet = ? AND recipient_wallet = ?`,
      [senderWallet.id, recipient1Wallet.id],
    );
    expect(transactionRows).toHaveLength(0);

    const sender = await repository.findByUserId(sender1UserId);
    const recipient = await repository.findByUserId(recipient1UserId);

    expect(sender?.balance_minor).toBe(senderBalance);
    expect(recipient?.balance_minor).toBe(0);

    const [idempotencyRows] = await pool.execute<IdempotencyKeysRow[]>(
      `SELECT * FROM idempotency_keys where idempotency_key = ?`,
      ["transfer-1"],
    );

    expect(idempotencyRows).toHaveLength(0);
  });

  it("should handle concurrent receives correctly", async () => {
    const transferAmount = 50_000;
    const senderInitBalance = 100_000;
    const currency = "NGN";

    const sender1Wallet = await repository.create(sender1UserId, currency);
    const sender2Wallet = await repository.create(sender2UserId, currency);
    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    await repository.updateBalance(sender1Wallet.id, senderInitBalance);
    await repository.updateBalance(sender2Wallet.id, senderInitBalance);
    createdWallets.push(sender1Wallet.id, sender2Wallet.id, recipient1Wallet.id);

    const service1 = new WalletService(pool);
    const service2 = new WalletService(pool);

    await Promise.all([
      service1.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "transfer-1",
      }),
      service2.transfer({
        senderUserId: sender2UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "transfer-2",
      }),
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

    createdWallets.push(sender1Wallet.id, recipient1Wallet.id);

    const service1 = new WalletService(pool);
    const service2 = new WalletService(pool);

    await Promise.all([
      service1.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmountToRecipient,
        idempotencyKey: "transfer-1",
      }),
      service2.transfer({
        senderUserId: recipient1UserId,
        recipientUserId: sender1UserId,
        amountMinor: transferAmountToSender,
        idempotencyKey: "transfer-2",
      }),
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

  it("should not process identical transfer requests twice when idempotency protection exists", async () => {
    const currency = "NGN";
    const initialBalance = 150_000;
    const transferAmount = 2_000;

    const sender1Wallet = await repository.create(sender1UserId, currency);
    await repository.updateBalance(sender1Wallet.id, initialBalance);

    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    createdWallets.push(sender1Wallet.id, recipient1Wallet.id);

    const service = new WalletService(pool);

    await service.transfer({
      senderUserId: sender1UserId,
      recipientUserId: recipient1UserId,
      amountMinor: transferAmount,
      idempotencyKey: "duplicate-transfer",
    });
    await service.transfer({
      senderUserId: sender1UserId,
      recipientUserId: recipient1UserId,
      amountMinor: transferAmount,
      idempotencyKey: "duplicate-transfer",
    });

    const sender1WalletAfter = await repository.findByUserId(sender1UserId);
    const recipient1WalletAfter = await repository.findByUserId(recipient1UserId);

    expect(sender1WalletAfter?.balance_minor).toBe(initialBalance - transferAmount);
    expect(recipient1WalletAfter?.balance_minor).toBe(transferAmount);
  });

  it("should reject an idempotency key reused for a different transfer", async () => {
    const currency = "NGN";
    const initialBalance = 150_000;
    const transferAmount = 2_000;

    const sender1Wallet = await repository.create(sender1UserId, currency);
    await repository.updateBalance(sender1Wallet.id, initialBalance);

    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    const recipient2Wallet = await repository.create(recipient2UserId, currency);
    createdWallets.push(sender1Wallet.id, recipient1Wallet.id, recipient2Wallet.id);

    const service = new WalletService(pool);

    await service.transfer({
      senderUserId: sender1UserId,
      recipientUserId: recipient1UserId,
      amountMinor: transferAmount,
      idempotencyKey: "duplicate-transfer",
    });

    await expect(
      service.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient2UserId,
        amountMinor: transferAmount,
        idempotencyKey: "duplicate-transfer",
      }),
    ).rejects.toThrow("idempotency key was already used for a different request");

    const sender1WalletAfter = await repository.findByUserId(sender1UserId);
    const recipient1WalletAfter = await repository.findByUserId(recipient1UserId);
    const recipient2WalletAfter = await repository.findByUserId(recipient2UserId);

    expect(sender1WalletAfter?.balance_minor).toBe(initialBalance - transferAmount);
    expect(recipient1WalletAfter?.balance_minor).toBe(transferAmount);
    expect(recipient2WalletAfter?.balance_minor).toBe(0);
  });

  it("should process concurrent identical requests only once", async () => {
    const currency = "NGN";
    const initialBalance = 150_000;
    const transferAmount = 2_000;

    const sender1Wallet = await repository.create(sender1UserId, currency);
    await repository.updateBalance(sender1Wallet.id, initialBalance);

    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    createdWallets.push(sender1Wallet.id, recipient1Wallet.id);

    const service = new WalletService(pool);

    await Promise.all([
      service.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "duplicate-transfer",
      }),
      service.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "duplicate-transfer",
      }),
    ]);

    const sender1WalletAfter = await repository.findByUserId(sender1UserId);
    const recipient1WalletAfter = await repository.findByUserId(recipient1UserId);

    expect(sender1WalletAfter?.balance_minor).toBe(initialBalance - transferAmount);
    expect(recipient1WalletAfter?.balance_minor).toBe(transferAmount);

    const [rows] = await pool.execute(
      `SELECT * FROM transactions WHERE sender_wallet = ? AND recipient_wallet = ?`,
      [sender1Wallet.id, recipient1Wallet.id],
    );
    expect(rows).toHaveLength(1);
  });

  it("should process concurrent different requests only once", async () => {
    const currency = "NGN";
    const initialBalance = 150_000;
    const transferAmount = 2_000;

    const sender1Wallet = await repository.create(sender1UserId, currency);
    const sender2Wallet = await repository.create(sender2UserId, currency);
    await repository.updateBalance(sender1Wallet.id, initialBalance);
    await repository.updateBalance(sender2Wallet.id, initialBalance);

    const recipient1Wallet = await repository.create(recipient1UserId, currency);
    const recipient2Wallet = await repository.create(recipient2UserId, currency);
    createdWallets.push(
      sender1Wallet.id,
      sender2Wallet.id,
      recipient1Wallet.id,
      recipient2Wallet.id,
    );

    const service = new WalletService(pool);

    const results = await Promise.allSettled([
      service.transfer({
        senderUserId: sender1UserId,
        recipientUserId: recipient1UserId,
        amountMinor: transferAmount,
        idempotencyKey: "duplicate-transfer",
      }),
      service.transfer({
        senderUserId: sender2UserId,
        recipientUserId: recipient2UserId,
        amountMinor: transferAmount,
        idempotencyKey: "duplicate-transfer",
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const sender1WalletAfter = await repository.findByUserId(sender1UserId);
    const sender2WalletAfter = await repository.findByUserId(sender2UserId);
    const recipient1WalletAfter = await repository.findByUserId(recipient1UserId);
    const recipient2WalletAfter = await repository.findByUserId(recipient2UserId);

    if (results[0]?.status === "fulfilled") {
      expect(sender1WalletAfter?.balance_minor).toBe(initialBalance - transferAmount);
      expect(recipient1WalletAfter?.balance_minor).toBe(transferAmount);

      expect(sender2WalletAfter?.balance_minor).toBe(initialBalance);
      expect(recipient2WalletAfter?.balance_minor).toBe(0);
    } else {
      expect(sender1WalletAfter?.balance_minor).toBe(initialBalance);
      expect(recipient1WalletAfter?.balance_minor).toBe(0);

      expect(sender2WalletAfter?.balance_minor).toBe(initialBalance - transferAmount);
      expect(recipient2WalletAfter?.balance_minor).toBe(transferAmount);
    }

    const [rows] = await pool.execute(
      `SELECT * FROM transactions WHERE sender_wallet IN (?, ?) AND recipient_wallet IN (?, ?)`,
      [sender1Wallet.id, sender2Wallet.id, recipient2Wallet.id, recipient1Wallet.id],
    );

    expect(rows).toHaveLength(1);
  });
});
