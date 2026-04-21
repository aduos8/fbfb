import "dotenv/config";
import { reindexSearchDocuments } from "../lib/tg-queries/searchIndexer";

async function main() {
  const result = await reindexSearchDocuments();
  console.log("[search:reindex] Indexed documents:", result);
}

main().catch((error) => {
  console.error("[search:reindex] Failed:", error);
  process.exit(1);
});
