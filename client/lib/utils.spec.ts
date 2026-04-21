import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn function", () => {
  it("merges classes correctly", () => { expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500"); });
  it("handles conditional classes", () => { const active = true; expect(cn("base", active && "on")).toBe("base on"); });
  it("handles false conditions", () => { const active = false; expect(cn("base", active && "on", null)).toBe("base"); });
  it("merges tailwind classes properly", () => { expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4"); });
  it("works with object notation", () => { expect(cn("base", { cond: true, "not-included": false })).toBe("base cond"); });
});
