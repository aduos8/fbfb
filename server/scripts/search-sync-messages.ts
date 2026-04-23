import { getCassandraClient, shutdownCassandra } from "../lib/tg-queries/queries";
import {
  SEARCH_INDEXES,
  deleteDocumentsByFilter,
  isTrackedSearchTaskId,
  updateDocuments,
  waitForTask,
} from "../lib/tg-queries/searchIndex";

const LOOKBACK_MS = 65 * 60 * 1000;
const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const CHUNK = 1000;

async function sync() {
  const client = getCassandraClient();
  const since = new Date(Date.now() - LOOKBACK_MS);
  const rows: any[] = [];
  let pageState: any = undefined;

  do {
    const r = await client.execute(
      "SELECT * FROM messages_by_id WHERE timestamp >= ? ALLOW FILTERING",
      [since],
      { prepare: true, fetchSize: 5000, pageState, readTimeout: 60000 }
    );
    rows.push(...r.rows);
    pageState = r.pageState ?? undefined;
  } while (pageState);

  if (!rows.length) { await shutdownCassandra(); return; }

  const uids: number[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map(row => ({
      documentId: `${row.chat_id}_${row.message_id}`,
      messageId: String(row.message_id),
      chatId: String(row.chat_id),
      senderId: row.user_id ?? null,
      senderUsername: null,
      senderDisplayName: null,
      chatTitle: null,
      chatType: null,
      chatUsername: null,
      content: String(row.content ?? ""),
      hasMedia: row.has_media ?? false,
      containsLinks: false,
      contentLength: String(row.content ?? "").length,
      timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
      timestampMs: row.timestamp ? new Date(row.timestamp).getTime() : null,
    }));
    const t = await updateDocuments(SEARCH_INDEXES.messages, batch);
    if (isTrackedSearchTaskId(t.taskUid)) {
      uids.push(t.taskUid);
    }
  }

  await Promise.all(uids.map(uid => waitForTask(uid, 300_000)));
  await shutdownCassandra();
}

async function evict() {
  const cutoff = Date.now() - WINDOW_MS;
  const task = await deleteDocumentsByFilter(SEARCH_INDEXES.messages, [
    { field: "timestampMs", operator: "lte", value: cutoff },
  ]);
  if (isTrackedSearchTaskId(task.taskUid)) {
    await waitForTask(task.taskUid, 300_000);
  }
}

const mode = process.argv[2] ?? "sync";
(mode === "evict" ? evict() : sync())
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
