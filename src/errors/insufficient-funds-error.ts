import { AppError } from "./app-error.js";

export class InsufficientFundsError extends AppError {
  constructor(message = "Insufficient funds") {
    super(409, "INSUFFICIENT_FUNDS", message);
  }
}
