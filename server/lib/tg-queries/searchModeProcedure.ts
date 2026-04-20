import { publicProcedure } from "../../trpc/init";

type AuthContext = {
  auth?: {
    userId?: string;
    role?: "user" | "admin" | "owner";
  };
};

export const searchModeProcedure = publicProcedure;

export function getSearchViewerRole(context: AuthContext) {
  return context.auth?.role ?? "user";
}

export function getSearchViewerUserId(context: AuthContext) {
  return context.auth?.userId;
}

export function shouldChargeSearchCredits(context: AuthContext) {
  return Boolean(context.auth?.userId);
}
