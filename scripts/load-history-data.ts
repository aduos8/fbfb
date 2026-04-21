import { Client, auth } from "cassandra-driver";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type UserData = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar: string | null;
  changed_at: string;
};

async function processSSTable(sstablePath: string): Promise<UserData[]> {
  const output = execSync(
    `docker exec tgosint-cassandra /opt/cassandra/tools/bin/sstabledump ${sstablePath}`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 }
  );

  const data = JSON.parse(output);
  const latestValues = new Map<string, UserData>();

  for (const partition of data) {
    const userId = partition.partition.key[0];

    if (!latestValues.has(userId)) {
      latestValues.set(userId, {
        user_id: userId,
        username: null,
        display_name: null,
        bio: null,
        avatar: null,
        changed_at: "",
      });
    }

    for (const row of partition.rows) {
      if (row.type !== "row") continue;

      const clustering = row.clustering;
      const changedAt = clustering[0];
      const field = clustering[1];

      const newValueCell = row.cells?.find((c: { name: string }) => c.name === "new_value");
      if (!newValueCell || newValueCell.deletion_info) continue;

      const user = latestValues.get(userId)!;
      const newValue = newValueCell.value;

      if (field === "username" && !user.username) {
        user.username = newValue;
        user.changed_at = changedAt;
      } else if (field === "display_name" && !user.display_name) {
        user.display_name = newValue;
      } else if (field === "bio" && !user.bio) {
        user.bio = newValue;
      } else if (field === "avatar" && !user.avatar) {
        user.avatar = newValue;
      }
    }
  }

  return Array.from(latestValues.values()).filter(u => u.username || u.display_name);
}

async function main() {
  const backupDir = path.join(__dirname, "../staging_backup_20260417_120001");
  const historyDir = path.join(backupDir, "user_history-d55740a0229611f1bf4d89ffa0afe0a7");

  console.log("Processing user history SSTables...");

  const files = ["nb-91-big-Data.db", "nb-92-big-Data.db", "nb-93-big-Data.db"];
  const allUsers: UserData[] = [];

  for (const file of files) {
    console.log(`Processing ${file}...`);
    try {
      const users = await processSSTable(`/tmp/history_backup/${file}`);
      console.log(`  Found ${users.length} users`);
      allUsers.push(...users);
    } catch (e) {
      console.error(`  Error: ${e}`);
    }
  }

  // Deduplicate - keep latest username/display_name for each user
  const userMap = new Map<string, UserData>();
  for (const user of allUsers) {
    if (!userMap.has(user.user_id)) {
      userMap.set(user.user_id, user);
    }
  }

  const uniqueUsers = Array.from(userMap.values());
  console.log(`\nTotal unique users: ${uniqueUsers.length}`);

  // Connect to Cassandra
  const client = new Client({
    contactPoints: ["localhost"],
    localDataCenter: "datacenter1",
    authProvider: new auth.PlainTextAuthProvider("cassandra", "cassandra"),
    keyspace: "tgosint",
  });

  await client.connect();
  console.log("Connected to Cassandra");

  // Batch insert
  let inserted = 0;
  const batchSize = 100;

  for (let i = 0; i < uniqueUsers.length; i += batchSize) {
    const batch = uniqueUsers.slice(i, i + batchSize);

    for (const user of batch) {
      try {
        await client.execute(
          `INSERT INTO users (user_id, username, display_name, bio, avatar_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, toTimestamp(now()), toTimestamp(now()))
           USING TTL 8640000`,
          [user.user_id, user.username, user.display_name, user.bio, user.avatar]
        );

        if (user.username) {
          await client.execute(
            `INSERT INTO users_by_username (username, user_id, display_name, avatar_url) VALUES (?, ?, ?, ?)`,
            [user.username, user.user_id, user.display_name, user.avatar]
          );
        }

        inserted++;
      } catch (e) {
        console.error(`Error inserting ${user.user_id}: ${e}`);
      }
    }

    console.log(`  Processed ${inserted}/${uniqueUsers.length} users`);
  }

  console.log(`\nInserted: ${inserted} users`);

  // Verify
  const count = await client.execute("SELECT count(*) FROM users");
  console.log(`Total users in Cassandra: ${count.rows[0].count}`);

  await client.shutdown();
  console.log("Done!");
}

main().catch(console.error);
