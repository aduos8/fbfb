import { describe, expect, it } from "vitest";
import { hashPhoneNumber, maskPhoneNumber, normalizePhoneNumber } from "./phone";

describe("phone helpers", () => {
  it("normalizes raw phone input", () => {
    expect(normalizePhoneNumber("+1 (555) 010-1234")).toBe("+15550101234");
  });

  it("hashes normalized phones deterministically", () => {
    expect(hashPhoneNumber("+1 (555) 010-1234")).toBe(hashPhoneNumber("+15550101234"));
  });

  it("masks phone numbers without exposing the full value", () => {
    expect(maskPhoneNumber("+15550101234")).toBe("+1******1234");
  });
});
