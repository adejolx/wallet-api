import { AppError } from "./app-error.js";

export class BadRequestError extends AppError {
  constructor(message = "Bad Request") {
    super(400, "BAD_REQUEST", message);
  }
}
