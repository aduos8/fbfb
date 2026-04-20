import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { authRouter } from "./routers/auth";
import { accountRouter } from "./routers/account";
import { creditsRouter } from "./routers/credits";
import { searchRouter } from "./routers/search";
import { purchasesRouter } from "./routers/purchases";
import { trackingRouter } from "./routers/tracking";
import { notificationsRouter } from "./routers/notifications";
import { redactionsRouter } from "./routers/redactions";
import { adminRouter } from "./routers/admin";
import { lookupRouter } from "./routers/lookup";
import { analyticsRouter } from "./routers/analytics";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  auth: authRouter,
  account: accountRouter,
  credits: creditsRouter,
  search: searchRouter,
  purchases: purchasesRouter,
  tracking: trackingRouter,
  notifications: notificationsRouter,
  redactions: redactionsRouter,
  admin: adminRouter,
  lookup: lookupRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
