import { router } from "../init";
import { z } from "zod";
import { searchModeProcedure, shouldChargeSearchCredits, getSearchViewerRole, getSearchViewerUserId } from "../../lib/tg-queries/searchModeProcedure";
import {
  channelSearchSchema,
  groupSearchSchema,
  messageSearchSchema,
  profileSearchSchema,
  unifiedSearchSchema,
} from "../../lib/tg-queries/searchSchemas";
import {
  runChannelSearch,
  runGroupSearch,
  runMessageSearch,
  runProfileSearch,
  runUnifiedSearch,
} from "../../lib/tg-queries/searchService";

function createSearchContext(context: { auth?: { userId?: string; role?: "user" | "admin" | "owner" } }) {
  return {
    chargeCredits: shouldChargeSearchCredits(context),
    userId: getSearchViewerUserId(context),
    role: getSearchViewerRole(context),
  } as const;
}

export const searchRouter = router({
  unified: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/search/unified", protect: true } })
    .input(unifiedSearchSchema)
    .output(z.object({ type: z.string(), results: z.array(z.unknown()), total: z.number() }))
    .query(async ({ ctx, input }) => runUnifiedSearch(input, createSearchContext(ctx))),

  searchProfiles: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchProfiles", protect: true } })
    .input(profileSearchSchema)
    .output(z.object({ results: z.array(z.unknown()), total: z.number() }))
    .mutation(async ({ ctx, input }) => runProfileSearch(input, createSearchContext(ctx))),

  searchChannels: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchChannels", protect: true } })
    .input(channelSearchSchema)
    .output(z.object({ results: z.array(z.unknown()), total: z.number() }))
    .mutation(async ({ ctx, input }) => runChannelSearch(input, createSearchContext(ctx))),

  searchGroups: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchGroups", protect: true } })
    .input(groupSearchSchema)
    .output(z.object({ results: z.array(z.unknown()), total: z.number() }))
    .mutation(async ({ ctx, input }) => runGroupSearch(input, createSearchContext(ctx))),

  searchMessages: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchMessages", protect: true } })
    .input(messageSearchSchema)
    .output(z.object({ results: z.array(z.unknown()), total: z.number(), warning: z.string().optional() }))
    .mutation(async ({ ctx, input }) => runMessageSearch(input, createSearchContext(ctx))),
});
