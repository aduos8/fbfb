import { trpc } from "@/lib/trpc";
import { useCallback } from "react";

export function useCreditsBalance() {
  const { data, refetch, isLoading, isError, error } = trpc.credits.getBalance.useQuery(
    undefined,
    { refetchInterval: 30000, retry: false, staleTime: 10000 }
  );

  const balance = data?.balance ?? 0;
  const hasCredits = balance > 0;

  const checkCredits = useCallback(
    (required = 1): { allowed: boolean; reason: string | null; balance: number } => {
      if (!isLoading && hasCredits && balance >= required) {
        return { allowed: true, reason: null, balance };
      }
      if (isLoading) return { allowed: false, reason: "loading", balance: 0 };
      return { allowed: false, reason: "no_credits", balance };
    },
    [balance, hasCredits, isLoading]
  );

  return { balance, hasCredits, isLoading, isError, error, refetch, checkCredits };
}
