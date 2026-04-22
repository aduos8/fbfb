import { trpc } from "@/lib/trpc";
import { isAuthenticated } from "@/lib/auth";

export function useAuthState() {
  const authed = isAuthenticated();
  const query = trpc.auth.me.useQuery(undefined, {
    enabled: authed,
    retry: false,
    staleTime: 30_000,
  });

  const user = query.data ?? null;
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  return {
    isAuthenticated: authed && !!user,
    hasAuthCookie: authed,
    isAdmin,
    isLoading: authed && query.isLoading,
    user,
    error: query.error,
  };
}