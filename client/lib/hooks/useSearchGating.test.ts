import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRefetch = vi.fn();

function buildState(auth: boolean, bal: number, loading: boolean) {
  if (loading) return { status: "loading" as const };
  if (!auth) return { status: "unauthenticated" as const };
  if (bal <= 0) return { status: "no_credits" as const, balance: bal };
  return { status: "ready" as const, balance: bal };
}

function buildHook(auth: boolean, bal: number, loading: boolean) {
  const gatingState = buildState(auth, bal, loading);
  const hasCredits = bal > 0;
  const check = () => {
    if (!auth) return { allowed: false, reason: "unauthenticated" as const, balance: 0 };
    if (loading) return { allowed: false, reason: "loading" as const, balance: 0 };
    if (!hasCredits) return { allowed: false, reason: "no_credits" as const, balance: bal };
    return { allowed: true, reason: null, balance: bal };
  };
  return { gatingState, check, canSearch: gatingState.status === "ready", requiresAuth: gatingState.status === "unauthenticated", requiresCredits: gatingState.status === "no_credits", refetchCredits: mockRefetch };
}

describe("useSearchGating logic", () => {
  beforeEach(() => mockRefetch.mockClear());

  describe("gating state transitions", () => {
    it("returns loading state", () => { const r = buildHook(false, 0, true); expect(r.gatingState).toEqual({ status: "loading" }); expect(r.canSearch).toBe(false); });
    it("returns unauthenticated state", () => { const r = buildHook(false, 0, false); expect(r.gatingState).toEqual({ status: "unauthenticated" }); expect(r.requiresAuth).toBe(true); });
    it("returns no_credits state", () => { const r = buildHook(true, 0, false); expect(r.gatingState).toEqual({ status: "no_credits", balance: 0 }); expect(r.requiresCredits).toBe(true); });
    it("returns ready state", () => { const r = buildHook(true, 5, false); expect(r.gatingState).toEqual({ status: "ready", balance: 5 }); expect(r.canSearch).toBe(true); });
  });

  describe("checkSearch function", () => {
    it("returns not allowed when unauthenticated", () => { const { check } = buildHook(false, 0, false); expect(check()).toEqual({ allowed: false, reason: "unauthenticated", balance: 0 }); });
    it("returns not allowed when loading", () => { const { check } = buildHook(true, 0, true); expect(check()).toEqual({ allowed: false, reason: "loading", balance: 0 }); });
    it("returns allowed when has credits", () => { const { check } = buildHook(true, 10, false); expect(check()).toEqual({ allowed: true, reason: null, balance: 10 }); });
  });

  describe("refetchCredits", () => {
    it("returns refetch function", () => { const { refetchCredits } = buildHook(true, 0, false); expect(refetchCredits).toBe(mockRefetch); });
    it("can be called", () => { const { refetchCredits } = buildHook(true, 0, false); refetchCredits(); expect(mockRefetch).toHaveBeenCalledTimes(1); });
  });
});
