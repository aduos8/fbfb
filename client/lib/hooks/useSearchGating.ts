import { useEffect, useState, useCallback } from "react";
import { isAuthenticated } from "@/lib/auth";
import { useCreditsBalance } from "./useCreditsBalance";

export type GatingState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "no_credits"; balance: number }
  | { status: "ready"; balance: number };

export interface SearchCheckResult {
  allowed: boolean;
  reason: "unauthenticated" | "no_credits" | "loading" | null;
  balance: number;
}

export function useSearchGating() {
  const [gatingState, setGatingState] = useState<GatingState>({ status: "loading" });
  const { balance, hasCredits, isLoading, refetch } = useCreditsBalance();

  useEffect(() => {
    if (isLoading) {
      setGatingState({ status: "loading" });
      return;
    }

    if (!isAuthenticated()) {
      setGatingState({ status: "unauthenticated" });
      return;
    }

    if (!hasCredits) {
      setGatingState({ status: "no_credits", balance });
      return;
    }

    setGatingState({ status: "ready", balance });
  }, [balance, hasCredits, isLoading]);

  const checkSearch = useCallback((): SearchCheckResult => {
    if (!isAuthenticated()) {
      return { allowed: false, reason: "unauthenticated", balance: 0 };
    }

    if (isLoading) {
      return { allowed: false, reason: "loading", balance: 0 };
    }

    if (!hasCredits) {
      return { allowed: false, reason: "no_credits", balance };
    }

    return { allowed: true, reason: null, balance };
  }, [balance, hasCredits, isLoading]);

  const canSearch = gatingState.status === "ready";
  const requiresAuth = gatingState.status === "unauthenticated";
  const requiresCredits = gatingState.status === "no_credits";

  return {
    gatingState,
    checkSearch,
    canSearch,
    requiresAuth,
    requiresCredits,
    refetchCredits: refetch,
  };
}
