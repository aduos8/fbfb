import { Client, auth } from "cassandra-driver";

async function main() {
  const targetKeyspace = "tgosint";
  
  // Connect without specifying a keyspace initially to avoid connection errors
  const client = new Client({
    contactPoints: ["localhost"],
    localDataCenter: "datacenter1",
    authProvider: new auth.PlainTextAuthProvider("cassandra", "cassandra"),
  });

  try {
    await client.connect();
    console.log(`Connected to Cassandra cluster.\n`);

    // Check if the keyspace actually exists
    const keyspacesResult = await client.execute("SELECT keyspace_name FROM system_schema.keyspaces");
    const existingKeyspaces = keyspacesResult.rows.map(r => r.keyspace_name);
    
    if (!existingKeyspaces.includes(targetKeyspace)) {
      console.error(`Error: Keyspace '${targetKeyspace}' does not exist!`);
      console.log(`Available keyspaces: ${existingKeyspaces.join(', ')}`);
      console.log(`\nHint: You may need to run your initialization script (e.g., 'bun run cassandra:init') to create the keyspace and tables first.`);
      return;
    }

    console.log(`Keyspace '${targetKeyspace}' found. Analyzing...\n`);

    // 1. Get all tables in the keyspace
    const tablesResult = await client.execute(
      "SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?",
      [targetKeyspace],
      { prepare: true }
    );

    const tables = tablesResult.rows.map((row) => row.table_name);

    if (tables.length === 0) {
      console.log(`No tables found in keyspace '${targetKeyspace}'.`);
      return;
    }

    // 2. Count rows in each table
    console.log("=== Table Row Counts ===");
    for (const table of tables) {
      try {
        // Warning: SELECT count(*) can be slow on very large Cassandra tables.
        // For extremely large datasets, this might timeout.
        const countResult = await client.execute(`SELECT count(*) FROM ${targetKeyspace}.${table}`);
        const count = countResult.rows[0].count;
        console.log(`- ${table.padEnd(25)}: ${count} rows`);
      } catch (err: any) {
        console.log(`- ${table.padEnd(25)}: Error getting count (${err.message})`);
      }
    }

    // 3. Find Secondary Indexes
    console.log("\n=== Secondary Indexes ===");
    console.log("Note: These columns can be used in WHERE clauses with '='");
    const indexesResult = await client.execute(
      "SELECT index_name, table_name, options FROM system_schema.indexes WHERE keyspace_name = ?",
      [targetKeyspace],
      { prepare: true }
    );

    const indexes = indexesResult.rows;
    if (indexes.length === 0) {
      console.log("  No secondary indexes found.");
    } else {
      for (const index of indexes) {
        const target = index.options ? index.options.target : "Unknown";
        console.log(`  - Table '${index.table_name}' has index '${index.index_name}' on column '${target}'`);
      }
    }

    // 4. Find Materialized Views (often used for alternate search paths)
    console.log("\n=== Materialized Views ===");
    console.log("Note: These views provide alternate partition keys for fast querying");
    const viewsResult = await client.execute(
      "SELECT view_name, base_table_name FROM system_schema.views WHERE keyspace_name = ?",
      [targetKeyspace],
      { prepare: true }
    );

    const views = viewsResult.rows;
    if (views.length === 0) {
      console.log("  No materialized views found.");
    } else {
      for (const view of views) {
        console.log(`  - View '${view.view_name}' (based on table '${view.base_table_name}')`);
      }
    }

  } catch (err) {
    console.error("Error fetching schema information:", err);
  } finally {
    await client.shutdown();
  }
}

main().catch(console.error);
