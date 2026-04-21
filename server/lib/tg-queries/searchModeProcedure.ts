import { TRPCError } from "@trpc/server";
import { publicProcedure } from "../../trpc/init";

type SearchContext = {
  userId?: string | null;
  userRole?: string | null;
  auth?: {
    userId?: string;
    role?: "user" | "admin" | "owner";
  };
};

export const searchModeProcedure = publicProcedure.use(({ ctx, next }) => {
  const userId = ctx.userId ?? ctx.auth?.userId ?? null;
  const role = (ctx.userRole ?? ctx.auth?.role ?? "user") as "user" | "admin" | "owner";

  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      userId,
      userRole: role,
      auth: {
        userId,
        role,
      },
    },
  });
});

export function getSearchViewerRole(context: SearchContext) {
  return (context.userRole ?? context.auth?.role ?? "user") as "user" | "admin" | "owner";
}

export function getSearchViewerUserId(context: SearchContext) {
  return context.userId ?? context.auth?.userId ?? null;
}
