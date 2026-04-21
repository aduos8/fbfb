import { router } from "../init";
import { z } from "zod";
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
import { searchModeProcedure } from "../../lib/tg-queries/searchModeProcedure";
import { ChannelResultSchema, GroupResultSchema, MessageResultSchema, ProfileResultSchema, SearchResultSchema, UnifiedSearchResponseSchema } from "../../../shared/api";
import { canUseAdvancedFilters, canUseMessageSearch, deductSearchCredit, ensureSearchCredits, getViewerAccess } from "../../lib/tg-queries/viewer";

async function buildSearchContext(ctx: { userId?: string | null; userRole?: string | null }) {
  const viewer = await getViewerAccess({ userId: ctx.userId, role: ctx.userRole });
  return { viewer };
}

async function maybeChargeSearch(ctx: { userId?: string | null }, searchType: string, query: string | undefined, page: number) {
  if (!ctx.userId) {
    return undefined;
  }

  if (page > 1) {
    await ensureSearchCredits(ctx.userId);
    return undefined;
  }

  return deductSearchCredit(ctx.userId, searchType, query?.slice(0, 200) ?? "");
}

async function enforceAdvancedFilterAccess(ctx: { userId?: string | null; userRole?: string | null }, input: any) {
  if (!ctx.userId) return;
  const filters = input?.filters;
  if (!filters) return;

  const usesAdvanced =
    Boolean(filters.dateStart) ||
    Boolean(filters.dateEnd) ||
    typeof filters.hasMedia === "boolean" ||
    typeof filters.containsLinks === "boolean" ||
    typeof filters.minLength === "number";

  if (!usesAdvanced) return;

  const allowed = await canUseAdvancedFilters(ctx.userId, ctx.userRole);
  if (!allowed) {
    throw new z.ZodError([{
      code: "custom",
      message: "Advanced filters require Intermediate/Advanced plan or Premium Filters add-on.",
      path: ["filters"],
    }]);
  }
}

async function enforceMessageSearchAccess(ctx: { userId?: string | null; userRole?: string | null }) {
  if (!ctx.userId) return;
  const allowed = await canUseMessageSearch(ctx.userId, ctx.userRole);
  if (!allowed) {
    throw new z.ZodError([{
      code: "custom",
      message: "Message search requires Pro/Enterprise plan or Message History add-on.",
      path: ["type"],
    }]);
  }
}

export const searchRouter = router({
  unified: searchModeProcedure
    .meta({ openapi: { method: "GET", path: "/search/unified", protect: true } })
    .input(unifiedSearchSchema)
    .output(UnifiedSearchResponseSchema)
    .query(async ({ ctx, input }) => {
      if (input.type === "message") {
        await enforceMessageSearchAccess(ctx);
      }
      const creditsRemaining = await maybeChargeSearch(ctx, input.type, input.query, input.page);
      const result = await runUnifiedSearch(input, await buildSearchContext(ctx));

      for (let i = 0; i < result.results.length; i++) {
        const r = result.results[i];
        const parseResult = SearchResultSchema.safeParse(r);
        if (!parseResult.success) {
          console.error(`[search-debug] result ${i} validation failed:`, JSON.stringify(r, null, 2));
          console.error(`[search-debug] validation errors:`, JSON.stringify(parseResult.error.format(), null, 2));
          for (const issue of parseResult.error.issues) {
            console.error(`[search-debug] issue:`, issue);
          }
        }
      }

      return creditsRemaining !== undefined ? { ...result, creditsRemaining } : result;
    }),

  searchProfiles: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchProfiles", protect: true } })
    .input(profileSearchSchema)
    .output(z.object({ results: z.array(ProfileResultSchema), total: z.number(), creditsRemaining: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const creditsRemaining = await maybeChargeSearch(ctx, "profile", input.query, input.page);
      const result = await runProfileSearch(input, await buildSearchContext(ctx));
      return creditsRemaining !== undefined ? { ...result, creditsRemaining } : result;
    }),

  searchChannels: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchChannels", protect: true } })
    .input(channelSearchSchema)
    .output(z.object({ results: z.array(ChannelResultSchema), total: z.number(), creditsRemaining: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const creditsRemaining = await maybeChargeSearch(ctx, "channel", input.query, input.page);
      const result = await runChannelSearch(input, await buildSearchContext(ctx));
      return creditsRemaining !== undefined ? { ...result, creditsRemaining } : result;
    }),

  searchGroups: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchGroups", protect: true } })
    .input(groupSearchSchema)
    .output(z.object({ results: z.array(GroupResultSchema), total: z.number(), creditsRemaining: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const creditsRemaining = await maybeChargeSearch(ctx, "group", input.query, input.page);
      const result = await runGroupSearch(input, await buildSearchContext(ctx));
      return creditsRemaining !== undefined ? { ...result, creditsRemaining } : result;
    }),

  searchMessages: searchModeProcedure
    .meta({ openapi: { method: "POST", path: "/search/searchMessages", protect: true } })
    .input(messageSearchSchema)
    .output(z.object({ results: z.array(MessageResultSchema), total: z.number(), creditsRemaining: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      await enforceMessageSearchAccess(ctx);
      await enforceAdvancedFilterAccess(ctx, input);
      const creditsRemaining = await maybeChargeSearch(ctx, "message", input.query ?? input.filters.keyword, input.page);
      const result = await runMessageSearch(input, await buildSearchContext(ctx));
      return creditsRemaining !== undefined ? { ...result, creditsRemaining } : result;
    }),
});
