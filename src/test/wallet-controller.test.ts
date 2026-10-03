import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";

import { BadRequestError } from "../errors/bad-request-error.js";
import { ConflictError } from "../errors/conflict-error.js";
import { InsufficientFundsError } from "../errors/insufficient-funds-error.js";
import { NotFoundError } from "../errors/not-found-error.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestId } from "../middleware/request-id.js";
import { createWalletRouter } from "../modules/wallet/wallet.controller.js";

describe("POST /transfer", () => {
  let app: Express;
  let consoleLogSpy: Mock<(...data: any[]) => void>;

  beforeEach(() => {
    app = express();
    app.use(requestId);
    app.use(express.json());
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
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
    expect(response.body).toEqual({
      code: "BAD_REQUEST",
      message: "amountMinor must be a positive, safe integer",
    });
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
    expect(response.body).toEqual({
      code: "BAD_REQUEST",
      message: "senderUserId must be a positive, safe integer",
    });
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
    expect(response.body).toEqual({
      code: "BAD_REQUEST",
      message: "recipientUserId must be a positive, safe integer",
    });
    expect(mockWalletService.transfer).not.toHaveBeenCalled();
  });

  test("returns an error when a user is not found", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    mockWalletService.transfer.mockRejectedValue(
      new NotFoundError("sender wallet not found"),
    );

    app.use(createWalletRouter(mockWalletService));
    app.use(errorHandler);

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: 1,
        recipientUserId: 2,
        amountMinor: 200,
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "NOT_FOUND",
      message: "sender wallet not found",
    });
  });

  test("returns an error when a idempotency key was used for another request", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    mockWalletService.transfer.mockRejectedValue(
      new ConflictError("idempotency key was already used for a different request"),
    );

    app.use(createWalletRouter(mockWalletService));
    app.use(errorHandler);

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: 1,
        recipientUserId: 2,
        amountMinor: 200,
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: "CONFLICT",
      message: "idempotency key was already used for a different request",
    });
  });

  test("returns an error when sender and recipient id are the same", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    mockWalletService.transfer.mockRejectedValue(
      new BadRequestError("sender and recipient cannot be the same"),
    );

    app.use(createWalletRouter(mockWalletService));
    app.use(errorHandler);

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: 1,
        recipientUserId: 2,
        amountMinor: 200,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: "BAD_REQUEST",
      message: "sender and recipient cannot be the same",
    });
  });

  test("returns an error when a wallet has insufficient funds", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    mockWalletService.transfer.mockRejectedValue(
      new InsufficientFundsError("Insufficient funds"),
    );

    app.use(createWalletRouter(mockWalletService));
    app.use(errorHandler);

    const response = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "transfer-1")
      .send({
        senderUserId: 1,
        recipientUserId: 2,
        amountMinor: 200,
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: "INSUFFICIENT_FUNDS",
      message: "Insufficient funds",
    });
  });

  test("returns an internal error", async () => {
    const mockWalletService = {
      transfer: vi.fn(),
    };

    mockWalletService.transfer.mockRejectedValue(
      new Error("database connection failed"),
    );

    app.use(createWalletRouter(mockWalletService));
    app.use(errorHandler);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request(app)
        .post("/transfers")
        .set("Idempotency-Key", "transfer-1")
        .send({
          senderUserId: 1,
          recipientUserId: 2,
          amountMinor: 200,
        });

      expect(spy).toHaveBeenCalledOnce();
      const text = spy.mock.calls[0]?.[0];
      if (typeof text !== "string") throw new Error("No JSON log line");
      const entry = JSON.parse(text);
      expect(entry.event).toBe("http.error");
      expect(entry.errorName).toBe("Error");
      expect(entry.requestId).toBeTypeOf("string");
      expect(entry.requestId).toBe(response.get("x-request-id"));

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      });
    } finally {
      spy.mockRestore();
    }
  });
});
