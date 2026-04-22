import "dotenv/config";
import { consumeSearchIndexOutbox, isLegacySearchSyncEnabled } from "../lib/tg-queries/searchSync";
import { legacySyncSearchDocuments } from "../lib/tg-queries/searchIndexer";

function parseScopes() {
  const scopeArg = process.argv.find((arg) => arg.startsWith("--scopes="));
  if (!scopeArg) {
    return undefined;
  }

  const scopes = scopeArg.split("=", 2)[1]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) as Array<"profiles" | "chats" | "messages"> | undefined;

  return scopes?.length ? scopes : undefined;
}

async function main() {
  const scopes = parseScopes();
  const shouldUseLegacyRescan = process.argv.includes("--legacy-rescan") || isLegacySearchSyncEnabled();
  const result = shouldUseLegacyRescan
    ? await legacySyncSearchDocuments(scopes)
    : await consumeSearchIndexOutbox(scopes);

  console.log("[search:sync] Synced documents:", result);
}

main().catch((error) => {
  console.error("[search:sync] Failed:", error);
  process.exit(1);
});
