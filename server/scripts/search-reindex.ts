import "dotenv/config";
import { reindexSearchDocuments } from "../lib/tg-queries/searchIndexer";

async function main() {
  console.log("[search:reindex] Starting shadow reindex of Cassandra → Meilisearch...");
  console.log("[search:reindex] This will rebuild profiles/chats plus the messages_by_chat corpus into shadow indexes, validate them, then swap them live.");
  console.log("");

  const startTime = Date.now();
  const result = await reindexSearchDocuments();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║       REINDEX COMPLETE               ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Profiles:  ${String(result.profiles).padStart(10)}          ║`);
  console.log(`║  Chats:     ${String(result.chats).padStart(10)}          ║`);
  console.log(`║  Messages:  ${String(result.messages).padStart(10)}          ║`);
  console.log(`║  Time:      ${(elapsed + "s").padStart(10)}          ║`);
  console.log("╚══════════════════════════════════════╝");
}

main().catch((error) => {
  console.error("[search:reindex] Failed:", error);
  process.exit(1);
});
