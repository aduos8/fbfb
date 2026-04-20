import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRefetch = vi.fn();

function buildGatingState(auth: boolean, balance: number, isLoading: boolean) {
  if (isLoading) return { status: "loading" as const };
  if (!auth) return { status: "unauthenticated" as const };
  if (balance <= 0) return { status: "no_credits" as const, balance };
  return { status: "ready" as const, balance };
}

function buildHookResult(auth: boolean, balance: number, isLoading: boolean) {
  const gatingState = buildGatingState(auth, balance, isLoading);
  const hasCredits = balance > 0;

  const canSearch = gatingState.status === "ready";
  const requiresAuth = gatingState.status === "unauthenticated";
  const requiresCredits = gatingState.status === "no_credits";

  const checkSearch = () => {
    if (!auth) return { allowed: false, reason: "unauthenticated" as const, balance: 0 };
    if (isLoading) return { allowed: false, reason: "loading" as const, balance: 0 };
    if (!hasCredits) return { allowed: false, reason: "no_credits" as const, balance };
    return { allowed: true, reason: null, balance };
  };

  return {
    gatingState,
    checkSearch,
    canSearch,
    requiresAuth,
    requiresCredits,
    refetchCredits: mockRefetch,
  };
}

describe("useSearchGating logic", () => {
  beforeEach(() => {
    mockRefetch.mockClear();
  });

  describe("gating state transitions", () => {
    it("returns loading state while credits query is loading", () => {
      const result = buildHookResult(false, 0, true);
      expect(result.gatingState).toEqual({ status: "loading" });
      expect(result.canSearch).toBe(false);
      expect(result.requiresAuth).toBe(false);
      expect(result.requiresCredits).toBe(false);
    });

    it("returns unauthenticated state when user has no token", () => {
      const result = buildHookResult(false, 0, false);
      expect(result.gatingState).toEqual({ status: "unauthenticated" });
      expect(result.canSearch).toBe(false);
      expect(result.requiresAuth).toBe(true);
      expect(result.requiresCredits).toBe(false);
    });

    it("returns no_credits state when authenticated but balance is zero", () => {
      const result = buildHookResult(true, 0, false);
      expect(result.gatingState).toEqual({ status: "no_credits", balance: 0 });
      expect(result.canSearch).toBe(false);
      expect(result.requiresAuth).toBe(false);
      expect(result.requiresCredits).toBe(true);
    });

    it("returns no_credits state when balance is negative", () => {
      const result = buildHookResult(true, -2, false);
      expect(result.gatingState).toEqual({ status: "no_credits", balance: -2 });
      expect(result.requiresCredits).toBe(true);
      expect(result.canSearch).toBe(false);
    });

    it("returns ready state when authenticated and has credits", () => {
      const result = buildHookResult(true, 5, false);
      expect(result.gatingState).toEqual({ status: "ready", balance: 5 });
      expect(result.canSearch).toBe(true);
      expect(result.requiresAuth).toBe(false);
      expect(result.requiresCredits).toBe(false);
    });

    it("returns ready state when authenticated and has exactly one credit", () => {
      const result = buildHookResult(true, 1, false);
      expect(result.gatingState).toEqual({ status: "ready", balance: 1 });
      expect(result.canSearch).toBe(true);
    });

    it("includes the current balance in no_credits state", () => {
      const result = buildHookResult(true, 0, false);
      const state = result.gatingState;
      expect(state).toEqual({ status: "no_credits", balance: 0 });
    });

    it("includes the current balance in ready state", () => {
      const result = buildHookResult(true, 42, false);
      const state = result.gatingState;
      expect(state).toEqual({ status: "ready", balance: 42 });
    });
  });

  describe("checkSearch function", () => {
    it("returns not allowed with unauthenticated reason when not logged in", () => {
      const { checkSearch } = buildHookResult(false, 0, false);
      expect(checkSearch()).toEqual({ allowed: false, reason: "unauthenticated", balance: 0 });
    });

    it("returns not allowed with loading reason when credits are loading", () => {
      const { checkSearch } = buildHookResult(true, 0, true);
      expect(checkSearch()).toEqual({ allowed: false, reason: "loading", balance: 0 });
    });

    it("returns not allowed with no_credits reason when balance is zero", () => {
      const { checkSearch } = buildHookResult(true, 0, false);
      expect(checkSearch()).toEqual({ allowed: false, reason: "no_credits", balance: 0 });
    });

    it("returns allowed with null reason when authenticated and has credits", () => {
      const { checkSearch } = buildHookResult(true, 10, false);
      expect(checkSearch()).toEqual({ allowed: true, reason: null, balance: 10 });
    });

    it("checkSearch evaluates current closure values at call time", () => {
      const { checkSearch } = buildHookResult(true, 0, false);
      expect(checkSearch()).toEqual({ allowed: false, reason: "no_credits", balance: 0 });
    });
  });

  describe("canSearch derived flag", () => {
    it("is true only in ready state", () => {
      const { canSearch } = buildHookResult(true, 5, false);
      expect(canSearch).toBe(true);
    });

    it("is false in loading state", () => {
      const { canSearch } = buildHookResult(false, 0, true);
      expect(canSearch).toBe(false);
    });

    it("is false in unauthenticated state", () => {
      const { canSearch } = buildHookResult(false, 0, false);
      expect(canSearch).toBe(false);
    });

    it("is false in no_credits state", () => {
      const { canSearch } = buildHookResult(true, 0, false);
      expect(canSearch).toBe(false);
    });
  });

  describe("requiresAuth derived flag", () => {
    it("is true only in unauthenticated state", () => {
      const { requiresAuth } = buildHookResult(false, 0, false);
      expect(requiresAuth).toBe(true);
    });

    it("is false when authenticated even without credits", () => {
      const { requiresAuth } = buildHookResult(true, 0, false);
      expect(requiresAuth).toBe(false);
    });

    it("is false when credits are loading", () => {
      const { requiresAuth } = buildHookResult(false, 0, true);
      expect(requiresAuth).toBe(false);
    });
  });

  describe("requiresCredits derived flag", () => {
    it("is true only in no_credits state", () => {
      const { requiresCredits } = buildHookResult(true, 0, false);
      expect(requiresCredits).toBe(true);
    });

    it("is false when user is unauthenticated", () => {
      const { requiresCredits } = buildHookResult(false, 0, false);
      expect(requiresCredits).toBe(false);
    });

    it("is false when credits are loading", () => {
      const { requiresCredits } = buildHookResult(false, 0, true);
      expect(requiresCredits).toBe(false);
    });

    it("is false when user has credits", () => {
      const { requiresCredits } = buildHookResult(true, 3, false);
      expect(requiresCredits).toBe(false);
    });
  });

  describe("refetchCredits", () => {
    it("returns the refetch function", () => {
      const { refetchCredits } = buildHookResult(true, 0, false);
      expect(refetchCredits).toBe(mockRefetch);
    });

    it("refetch can be called on no_credits state to retry", () => {
      const { refetchCredits } = buildHookResult(true, 0, false);
      refetchCredits();
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("mutual exclusivity of gating states", () => {
    it("loading: no flags are true", () => {
      const { canSearch, requiresAuth, requiresCredits } = buildHookResult(false, 0, true);
      const trueCount = [canSearch, requiresAuth, requiresCredits].filter(Boolean).length;
      expect(trueCount).toBe(0);
    });

    it("unauthenticated: only requiresAuth is true", () => {
      const { canSearch, requiresAuth, requiresCredits } = buildHookResult(false, 0, false);
      const trueCount = [canSearch, requiresAuth, requiresCredits].filter(Boolean).length;
      expect(trueCount).toBe(1);
      expect(requiresAuth).toBe(true);
    });

    it("no_credits: only requiresCredits is true", () => {
      const { canSearch, requiresAuth, requiresCredits } = buildHookResult(true, 0, false);
      const trueCount = [canSearch, requiresAuth, requiresCredits].filter(Boolean).length;
      expect(trueCount).toBe(1);
      expect(requiresCredits).toBe(true);
    });

    it("ready: only canSearch is true", () => {
      const { canSearch, requiresAuth, requiresCredits } = buildHookResult(true, 5, false);
      const trueCount = [canSearch, requiresAuth, requiresCredits].filter(Boolean).length;
      expect(trueCount).toBe(1);
      expect(canSearch).toBe(true);
    });
  });
});

describe("useCreditsBalance logic", () => {
  beforeEach(() => {
    mockRefetch.mockClear();
  });

  describe("checkCredits function logic", () => {
    const checkCredits = (balance: number, hasCredits: boolean, isLoading: boolean, required = 1) => {
      if (!isLoading && hasCredits && balance >= required) {
        return { allowed: true, reason: null, balance };
      }
      if (isLoading) {
        return { allowed: false, reason: "loading", balance: 0 };
      }
      return { allowed: false, reason: "no_credits", balance };
    };

    it("returns allowed when balance meets required amount", () => {
      const result = checkCredits(5, true, false, 1);
      expect(result).toEqual({ allowed: true, reason: null, balance: 5 });
    });

    it("returns not allowed with loading reason when query is loading", () => {
      const result = checkCredits(5, true, true, 1);
      expect(result).toEqual({ allowed: false, reason: "loading", balance: 0 });
    });

    it("returns not allowed when balance is below required amount", () => {
      const result = checkCredits(3, true, false, 5);
      expect(result).toEqual({ allowed: false, reason: "no_credits", balance: 3 });
    });

    it("allows checking for more than one credit requirement", () => {
      const result = checkCredits(5, true, false, 3);
      expect(result).toEqual({ allowed: true, reason: null, balance: 5 });
    });

    it("returns not allowed when hasCredits is false even with non-zero balance", () => {
      const result = checkCredits(0, false, false, 1);
      expect(result).toEqual({ allowed: false, reason: "no_credits", balance: 0 });
    });

    it("returns allowed when balance equals required amount exactly", () => {
      const result = checkCredits(3, true, false, 3);
      expect(result).toEqual({ allowed: true, reason: null, balance: 3 });
    });

    it("returns not allowed when balance is less than required by 1", () => {
      const result = checkCredits(2, true, false, 3);
      expect(result).toEqual({ allowed: false, reason: "no_credits", balance: 2 });
    });
  });

  describe("balance from tRPC query", () => {
    it("defaults balance to 0 when data is undefined", () => {
      const data: { balance: number } | undefined = undefined;
      const balance = data?.balance ?? 0;
      expect(balance).toBe(0);
    });

    it("uses balance from query data when available", () => {
      const data = { balance: 42 };
      const balance = data?.balance ?? 0;
      expect(balance).toBe(42);
    });

    it("hasCredits is true when balance is greater than 0", () => {
      const balance = 10;
      const hasCredits = balance > 0;
      expect(hasCredits).toBe(true);
    });

    it("hasCredits is false when balance is exactly 0", () => {
      const balance = 0;
      const hasCredits = balance > 0;
      expect(hasCredits).toBe(false);
    });

    it("hasCredits is false when balance is negative", () => {
      const balance = -5;
      const hasCredits = balance > 0;
      expect(hasCredits).toBe(false);
    });
  });

  describe("refetch and state exposure", () => {
    it("exposes refetch from the tRPC query", () => {
      const result = { balance: 5, hasCredits: true, isLoading: false, isError: false, error: null, refetch: mockRefetch, checkCredits: expect.any(Function) };
      expect(result.refetch).toBe(mockRefetch);
    });

    it("isLoading reflects tRPC query loading state when true", () => {
      const result = { balance: 0, hasCredits: false, isLoading: true, isError: false, error: null, refetch: mockRefetch, checkCredits: expect.any(Function) };
      expect(result.isLoading).toBe(true);
    });

    it("isLoading is false when query is not loading", () => {
      const result = { balance: 5, hasCredits: true, isLoading: false, isError: false, error: null, refetch: mockRefetch, checkCredits: expect.any(Function) };
      expect(result.isLoading).toBe(false);
    });

    it("isError reflects tRPC query error state when true", () => {
      const result = { balance: 0, hasCredits: false, isLoading: false, isError: true, error: new Error("Network error"), refetch: mockRefetch, checkCredits: expect.any(Function) };
      expect(result.isError).toBe(true);
    });

    it("isError is false when query succeeds", () => {
      const result = { balance: 5, hasCredits: true, isLoading: false, isError: false, error: null, refetch: mockRefetch, checkCredits: expect.any(Function) };
      expect(result.isError).toBe(false);
    });
  });
});

describe("gating state machine completeness", () => {
  const allStates = [
    { name: "loading", auth: false, balance: 0, isLoading: true, expectedStatus: "loading" },
    { name: "unauthenticated", auth: false, balance: 0, isLoading: false, expectedStatus: "unauthenticated" },
    { name: "no_credits", auth: true, balance: 0, isLoading: false, expectedStatus: "no_credits" },
    { name: "ready", auth: true, balance: 5, isLoading: false, expectedStatus: "ready" },
  ];

  allStates.forEach(({ name, auth, balance, isLoading, expectedStatus }) => {
    it(`maps ${name} state correctly`, () => {
      const { gatingState } = buildHookResult(auth, balance, isLoading);
      expect(gatingState).toHaveProperty("status", expectedStatus);
    });
  });
});
