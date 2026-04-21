import { Client, auth } from "cassandra-driver";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ChatData = {
  chat_id: string;
  chat_type: string | null;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  member_count: number | null;
  participants_count: number | null;
  avatar_url: string | null;
};

async function dumpChatsSSTable(sstablePath: string): Promise<ChatData[]> {
  const output = execSync(
    `docker exec tgosint-cassandra /opt/cassandra/tools/bin/sstabledump ${sstablePath}`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 }
  );

  const data = JSON.parse(output);
  const chats: ChatData[] = [];

  for (const partition of data) {
    const chat: ChatData = {
      chat_id: partition.partition.key[0],
      chat_type: null,
      username: null,
      display_name: null,
      bio: null,
      member_count: null,
      participants_count: null,
      avatar_url: null,
    };

    for (const row of partition.rows) {
      if (row.type !== "row") continue;

      const cells = row.cells || [];
      for (const cell of cells) {
        if (cell.deletion_info) continue;

        switch (cell.name) {
          case "chat_type": chat.chat_type = cell.value; break;
          case "username": chat.username = cell.value; break;
          case "display_name": chat.display_name = cell.value; break;
          case "bio": chat.bio = cell.value || null; break;
          case "member_count": chat.member_count = parseInt(cell.value, 10); break;
          case "participants_count": chat.participants_count = parseInt(cell.value, 10); break;
          case "avatar_url": chat.avatar_url = cell.value; break;
        }
      }

      chats.push(chat);
    }
  }

  return chats;
}

async function main() {
  const backupDir = path.join(__dirname, "../staging_backup_20260417_120001");
  const chatsDir = path.join(backupDir, "chats-d4a64020229611f1bf4d89ffa0afe0a7");

  console.log("Processing chats SSTable...");

  const files = ["nb-89-big-Data.db"];

  const allChats: ChatData[] = [];

  for (const file of files) {
    console.log(`Processing ${file}...`);
    try {
      const chats = await dumpChatsSSTable(`/tmp/chats_backup/${file}`);
      console.log(`  Found ${chats.length} chats`);
      allChats.push(...chats);
    } catch (e) {
      console.error(`  Error: ${e}`);
    }
  }

  console.log(`\nTotal chats: ${allChats.length}`);

  // Connect to Cassandra
  const client = new Client({
    contactPoints: ["localhost"],
    localDataCenter: "datacenter1",
    authProvider: new auth.PlainTextAuthProvider("cassandra", "cassandra"),
    keyspace: "tgosint",
  });

  await client.connect();
  console.log("Connected to Cassandra");

  let inserted = 0;

  for (const chat of allChats) {
    try {
      // Skip if no display_name or username
      if (!chat.display_name && !chat.username) continue;

      await client.execute(
        `INSERT INTO chats (chat_id, chat_type, username, display_name, bio, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, toTimestamp(now()), toTimestamp(now()))
         USING TTL 8640000`,
        [chat.chat_id, chat.chat_type || 'unknown', chat.username, chat.display_name, chat.bio, chat.avatar_url]
      );
      inserted++;
    } catch (e) {
      console.error(`Error inserting ${chat.chat_id}: ${e}`);
    }
  }

  console.log(`\nInserted: ${inserted} chats`);

  const count = await client.execute("SELECT count(*) FROM chats");
  console.log(`Total chats in Cassandra: ${count.rows[0].count}`);

  await client.shutdown();
  console.log("Done!");
}

main().catch(console.error);
