import "dotenv/config";
import { configureSearchIndices, getSearchBackend } from "../lib/tg-queries/searchIndex";

async function main() {
  await configureSearchIndices();
  console.log(`[search:configure] ${getSearchBackend()} index configuration applied`);
}

main().catch((error) => {
  console.error("[search:configure] Failed:", error);
  process.exit(1);
});
