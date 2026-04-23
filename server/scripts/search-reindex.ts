import "dotenv/config";
import {
  reindexSearchDocuments,
  resumeSearchReindex,
} from "../lib/tg-queries/searchIndexer";
import { getSearchBackend } from "../lib/tg-queries/searchIndex";
import {
  getSearchReindexCliArgs,
  hasCliFlag,
  parseRunIdFromArgs,
  parseScopesFromArgs,
} from "./searchReindexCli";

async function main() {
  const argv = getSearchReindexCliArgs();
  const scopes = parseScopesFromArgs(argv);
  const runId = parseRunIdFromArgs(argv);
  const resume = hasCliFlag(argv, "--resume") || Boolean(runId);

  console.log(
    `[search:reindex] Parsed CLI args: ${JSON.stringify({
      argv,
      resume,
      runId: runId ?? null,
      scopes: scopes ?? null,
    })}`
  );
  console.log(
    `[search:reindex] Starting ${resume ? "resume" : "shadow reindex"} of Cassandra -> ${getSearchBackend()}...`
  );
  if (resume) {
    console.log(
      runId
        ? `[search:reindex] Resuming full reindex run: ${runId}`
        : "[search:reindex] Resuming the latest failed or running full reindex."
    );
    if (scopes) {
      console.log(
        `[search:reindex] Ignoring --scopes=${scopes.join(",")} because resume reuses the stored run scopes.`
      );
    }
  } else {
    console.log(
      scopes
        ? `[search:reindex] Rebuilding scopes: ${scopes.join(", ")}`
        : "[search:reindex] Rebuilding profiles/chats plus the messages_by_chat corpus into shadow indexes, validate them, then swap them live."
    );
  }
  console.log("");

  const startTime = Date.now();
  const result = resume
    ? await resumeSearchReindex(runId)
    : await reindexSearchDocuments(scopes);
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
