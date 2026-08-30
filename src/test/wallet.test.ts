import { describe, expect, it } from "vitest";
import { Wallet } from "../modules/wallet/wallet.domain.js";

describe("Wallet", () => {
  it("should start with a zero balance", () => {
    const wallet = new Wallet();
    expect(wallet.balanceMinor).toBe(0);
  });
  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "should reject invalid initial balance %j",
    (amount) => {
      expect(() => new Wallet(amount)).toThrow();
    },
  );
  it("should credit correctly", () => {
    const wallet = new Wallet();
    const updatedWallet = wallet.credit(100);
    expect(updatedWallet.balanceMinor).toBe(100);
  });
  it("should debit correctly", () => {
    const wallet = new Wallet(100);
    const updatedWallet = wallet.debit(50);
    expect(updatedWallet.balanceMinor).toBe(50);
  });
  it("should reject insufficient funds", () => {
    const wallet = new Wallet(100);
    expect(() => wallet.debit(150)).toThrow();
  });
  it.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "should reject invalid transaction amount %j",
    (amount) => {
      const wallet = new Wallet(100);
      expect(() => wallet.credit(amount)).toThrow();
      expect(() => wallet.debit(amount)).toThrow();
    },
  );
  it("should not mutate the original wallet", () => {
    const wallet = new Wallet(100);
    wallet.credit(50);
    expect(wallet.balanceMinor).toBe(100);
  });
});
