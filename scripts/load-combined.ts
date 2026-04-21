import { Client, auth } from "cassandra-driver";
import fs from "node:fs/promises";

type UserRecord = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

async function processHistoryFile(filePath: string, users: Map<string, UserRecord>) {
  const content = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(content);

  for (const partition of data) {
    const userId = partition.partition.key[0];

    if (!users.has(userId)) {
      users.set(userId, {
        user_id: userId,
        username: null,
        display_name: null,
        avatar_url: null,
      });
    }

    const user = users.get(userId)!;

    for (const row of partition.rows) {
      if (row.type !== "row") continue;

      const clustering = row.clustering;
      const field = clustering[1];

      const newValueCell = row.cells?.find((c: any) => c.name === "new_value");
      if (!newValueCell || newValueCell.deletion_info) continue;

      switch (field) {
        case "username":
          if (!user.username) user.username = newValueCell.value;
          break;
        case "display_name":
          if (!user.display_name) user.display_name = newValueCell.value;
          break;
        case "avatar":
          if (!user.avatar_url) user.avatar_url = newValueCell.value;
          break;
        case "bio":
          // bio is not in our schema but we'll skip it
          break;
      }
    }
  }
}

async function main() {
  console.log("Loading user data from backup...");

  const users = new Map<string, UserRecord>();

  // Process history files
  for (const file of ["/tmp/h91.json", "/tmp/h92.json", "/tmp/h93.json"]) {
    console.log(`Processing ${file}...`);
    await processHistoryFile(file, users);
    console.log(`  Found ${users.size} users so far`);
  }

  // Process users_by_username
  console.log("Processing /tmp/u89.json...");
  const u89Content = await fs.readFile("/tmp/u89.json", "utf8");
  const u89Data = JSON.parse(u89Content);

  for (const partition of u89Data) {
    const username = partition.partition.key[0];

    for (const row of partition.rows) {
      if (row.type !== "row") continue;

      const clustering = row.clustering;
      const userId = clustering[0];

      if (!users.has(userId)) {
        users.set(userId, {
          user_id: userId,
          username: username,
          display_name: null,
          avatar_url: null,
        });
      } else {
        const user = users.get(userId)!;
        if (!user.username) user.username = username;
      }
    }
  }

  console.log(`\nTotal users: ${users.size}`);

  // Count users with usernames
  let withUsername = 0;
  let withDisplayName = 0;
  for (const user of users.values()) {
    if (user.username) withUsername++;
    if (user.display_name) withDisplayName++;
  }
  console.log(`Users with username: ${withUsername}`);
  console.log(`Users with display_name: ${withDisplayName}`);

  // Connect to Cassandra
  const client = new Client({
    contactPoints: ["localhost"],
    localDataCenter: "datacenter1",
    authProvider: new auth.PlainTextAuthProvider("cassandra", "cassandra"),
    keyspace: "tgosint",
  });

  await client.connect();
  console.log("\nConnected to Cassandra");

  // Clear existing data
  await client.execute("TRUNCATE users");
  await client.execute("TRUNCATE users_by_username");
  console.log("Cleared existing data");

  // Insert users
  let inserted = 0;
  for (const user of users.values()) {
    if (!user.username && !user.display_name) continue;

    try {
      await client.execute(
        `INSERT INTO users (user_id, username, display_name, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, toTimestamp(now()), toTimestamp(now()))`,
        [user.user_id, user.username, user.display_name, user.avatar_url]
      );

      if (user.username) {
        await client.execute(
          `INSERT INTO users_by_username (username, user_id, display_name, avatar_url)
           VALUES (?, ?, ?, ?)`,
          [user.username, user.user_id, user.display_name, user.avatar_url]
        );
      }

      inserted++;
    } catch (e) {
      // Skip errors
    }

    if (inserted % 1000 === 0) {
      console.log(`  Inserted ${inserted}/${users.size}`);
    }
  }

  console.log(`\nInserted: ${inserted} users`);

  // Verify
  const count = await client.execute("SELECT count(*) FROM users");
  console.log(`Total users in Cassandra: ${count.rows[0].count}`);

  await client.shutdown();
  console.log("Done!");
}

main().catch(console.error);
