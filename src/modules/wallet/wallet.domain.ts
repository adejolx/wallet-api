export class Wallet {
  readonly #balanceMinor: number;

  constructor(amount = 0) {
    this.#validateBalance(amount);
    this.#balanceMinor = amount;
  }

  #validateBalance(amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new Error("Balance must be a non-negative safe integer");
    return amount;
  }

  #validateTransactionAmount(amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new Error("Amount must be a positive safe integer");
    return amount;
  }

  get balanceMinor(): number {
    return this.#balanceMinor;
  }

  credit(amountMinor: number): Wallet {
    const amount = this.#validateTransactionAmount(amountMinor);
    return new Wallet(this.#balanceMinor + amount);
  }

  debit(amountMinor: number): Wallet {
    const amount = this.#validateTransactionAmount(amountMinor);
    if (this.#balanceMinor < amount) throw new Error("Balance is insufficient");
    return new Wallet(this.#balanceMinor - amount);
  }
}
