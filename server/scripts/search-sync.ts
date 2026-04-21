import "dotenv/config";
import { syncSearchDocuments } from "../lib/tg-queries/searchIndexer";

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
  const result = await syncSearchDocuments(parseScopes());
  console.log("[search:sync] Synced documents:", result);
}

main().catch((error) => {
  console.error("[search:sync] Failed:", error);
  process.exit(1);
});
