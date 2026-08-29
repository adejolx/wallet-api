import { describe, expect, it } from "vitest";
import { parsePort } from "../config.js";

describe("parsePort", () => {
  it("defaults to 3000 when the value is missing", () => {
    expect(parsePort(undefined)).toBe(3000);
  });
  it("accepts a valid port", () => {
    expect(parsePort("4100")).toBe(4100);
  });
  it.each(["", "abc", "3.14", "0", "65536"])("rejects invalid value %j", (value) => {
    expect(() => parsePort(value)).toThrow();
  });
});
