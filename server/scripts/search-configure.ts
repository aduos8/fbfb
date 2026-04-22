import "dotenv/config";
import { configureSearchIndices } from "../lib/tg-queries/searchIndex";

async function main() {
  await configureSearchIndices();
  console.log("[search:configure] Meilisearch index settings applied");
}

main().catch((error) => {
  console.error("[search:configure] Failed:", error);
  process.exit(1);
});
