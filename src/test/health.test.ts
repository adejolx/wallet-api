import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";

describe("GET /health", () => {
  it("returns the service health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "wallet-api",
    });
  });
  it("returns 404 for unknown routes", async () => {
    const response = await request(app).get("/unknown");

    expect(response.status).toBe(404);
  });
});
