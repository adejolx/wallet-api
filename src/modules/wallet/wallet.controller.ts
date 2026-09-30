import { Router } from "express";

import { WalletService } from "./wallet.service.js";

type WalletTransferService = Pick<WalletService, "transfer">;

export const createWalletRouter = (walletService: WalletTransferService) => {
  const walletRouter = Router();
  walletRouter.post("/transfers", async (req, res, next) => {
    try {
      const idempotencyKey = req.get("Idempotency-Key");
      if (!idempotencyKey)
        return res.status(400).json({
          code: "MISSING_IDEMPOTENCY_KEY",
          message: "Idempotency-Key header is required",
        });

      const { senderUserId, recipientUserId, amountMinor } = req.body;

      if (!Number.isSafeInteger(senderUserId) || senderUserId <= 0) {
        return res.status(400).json({
          code: "BAD_REQUEST",
          message: "senderUserId must be a positive, safe integer",
        });
      }

      if (!Number.isSafeInteger(recipientUserId) || recipientUserId <= 0) {
        return res.status(400).json({
          code: "BAD_REQUEST",
          message: "recipientUserId must be a positive, safe integer",
        });
      }

      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        return res.status(400).json({
          code: "BAD_REQUEST",
          message: "amountMinor must be a positive, safe integer",
        });
      }

      const result = await walletService.transfer({
        senderUserId,
        recipientUserId,
        amountMinor,
        idempotencyKey,
      });

      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  });
  return walletRouter;
};
