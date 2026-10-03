import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import app from "../app.js";

describe("GET /health", () => {
  it("returns the service health", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const response = await request(app).get("/health");

      expect(spy).toHaveBeenCalledTimes(1);

      const text = spy.mock.calls[0]?.[0];
      if (typeof text !== "string") throw new Error("No JSON log line");
      const entry = JSON.parse(text);

      expect(entry.requestId).toBe(response.headers["x-request-id"]);
      expect(entry.method).toBe("GET");
      expect(entry.path).toBe("/health");
      expect(entry.statusCode).toBe(200);
      expect(entry.elapsedMs).toBeGreaterThanOrEqual(0);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: "ok",
        service: "wallet-api",
      });
      expect(response.headers["x-request-id"]).not.toBeUndefined();
      expect(response.headers["x-request-id"]).toBeTypeOf("string");
    } finally {
      spy.mockRestore();
    }
  });

  it("returns 404 for unknown routes", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const firstResponse = await request(app).get("/unknown");
      const secondResponse = await request(app).get("/health");

      expect(spy).toHaveBeenCalledTimes(2);

      const firstText = spy.mock.calls[0]?.[0];

      if (typeof firstText !== "string")
        throw new Error("No JSON log line for first request");
      const firstEntry = JSON.parse(firstText);
      expect(firstEntry.requestId).toBe(firstResponse.headers["x-request-id"]);
      expect(firstEntry.method).toBe("GET");
      expect(firstEntry.path).toBe("/unknown");
      expect(firstEntry.statusCode).toBe(404);
      expect(firstEntry.elapsedMs).toBeGreaterThanOrEqual(0);

      const secondText = spy.mock.calls[1]?.[0];

      if (typeof secondText !== "string")
        throw new Error("No JSON log line for second request");

      const secondEntry = JSON.parse(secondText);
      expect(secondEntry.requestId).toBe(secondResponse.headers["x-request-id"]);
      expect(secondEntry.method).toBe("GET");
      expect(secondEntry.path).toBe("/health");
      expect(secondEntry.statusCode).toBe(200);
      expect(secondEntry.elapsedMs).toBeGreaterThanOrEqual(0);

      expect(firstResponse.status).toBe(404);
      expect(firstResponse.headers["content-type"]).toMatch("application/json;");
      expect(firstResponse.body).toEqual({
        code: "NOT_FOUND",
        message: "Route GET /unknown not found",
      });

      expect(firstResponse.headers["x-request-id"]).toBeTypeOf("string");
      expect(secondResponse.headers["x-request-id"]).toBeTypeOf("string");
      expect(firstResponse.headers["x-request-id"]).not.toEqual(
        secondResponse.headers["x-request-id"],
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("It returns 404 for POST /health ", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const response = await request(app).post("/health");

      expect(response.headers["x-request-id"]).not.toBeUndefined();
      expect(response.headers["x-request-id"]).toBeTypeOf("string");

      expect(response.statusCode).toBe(404);
      expect(response.body).toEqual({
        code: "NOT_FOUND",
        message: "Route POST /health not found",
      });

      expect(spy).toHaveBeenCalledTimes(1);

      const text = spy.mock.calls[0]?.[0];

      if (typeof text !== "string") throw new Error("No JSON log line");

      const entry = JSON.parse(text);

      expect(entry.requestId).toEqual(response.headers["x-request-id"]);
      expect(entry.method).toBe("POST");
      expect(entry.path).toBe("/health");
      expect(entry.statusCode).toBe(404);
    } finally {
      spy.mockRestore();
    }
  });
});
