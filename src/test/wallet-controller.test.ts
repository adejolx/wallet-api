import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWalletRouter } from "../modules/wallet/wallet.controller.js";

describe("POST /transfer", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  test("without Idempotency-Key", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    app.use(createWalletRouter(mockWalletService));

    const response = await request(app).post("/transfers");

    expect(response.status).toBe(400);
    expect(mockWalletService.transfer).not.toHaveBeenCalled();
  });

  test("returns a 2xx response", async () => {
    const mockWalletService = {
      transfer: vi.fn().mockResolvedValue({ transactionId: 123 }),
    };

    app.use(createWalletRouter(mockWalletService));

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: 1,
        recipientUserId: 2,
        amountMinor: 2000,
      });

    expect(response.status).toBe(200);

    expect(mockWalletService.transfer).toHaveBeenCalledWith({
      senderUserId: 1,
      recipientUserId: 2,
      amountMinor: 2000,
      idempotencyKey: "transfer-1",
    });
  });

  test("returns 400 when amountMinor is invalid", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    app.use(createWalletRouter(mockWalletService));

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: 1,
        recipientUserId: 2,
        amountMinor: -200,
      });

    expect(response.status).toBe(400);
    expect(mockWalletService.transfer).not.toHaveBeenCalled();
  });

  test("returns 400 when senderUserId is invalid", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    app.use(createWalletRouter(mockWalletService));

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: -1,
        recipientUserId: 2,
        amountMinor: 200,
      });

    expect(response.status).toBe(400);
    expect(mockWalletService.transfer).not.toHaveBeenCalled();
  });

  test("returns 400 when recipientUserId is invalid", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    app.use(createWalletRouter(mockWalletService));

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: 1,
        recipientUserId: "2",
        amountMinor: 200,
      });

    expect(response.status).toBe(400);
    expect(mockWalletService.transfer).not.toHaveBeenCalled();
  });
});
