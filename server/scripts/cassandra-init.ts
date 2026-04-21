import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, auth } from "cassandra-driver";

function splitCqlStatements(input: string) {
  const cleaned = input
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return cleaned
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function buildClient(keyspace?: string) {
  const contactPoints = (process.env.CASSANDRA_CONTACT_POINTS || "127.0.0.1")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const localDataCenter = process.env.CASSANDRA_LOCAL_DC || "datacenter1";
  const username = process.env.CASSANDRA_USERNAME || "";
  const password = process.env.CASSANDRA_PASSWORD || "";

  const options: ConstructorParameters<typeof Client>[0] = {
    contactPoints,
    localDataCenter,
  };

  if (keyspace) {
    options.keyspace = keyspace;
  }

  if (username && password) {
    options.authProvider = new auth.PlainTextAuthProvider(username, password);
  }

  return new Client(options);
}

async function executeWithRetry(client: Client, statement: string, retries = 30) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await client.execute(statement);
      return;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.warn(`[cassandra:init] retry ${attempt}/${retries} for statement: ${statement.slice(0, 80)}...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const schemaFile = path.join(repoRoot, "server/cassandra-schema.cql");
  const statements = splitCqlStatements(await fs.readFile(schemaFile, "utf8"));
  const configuredKeyspace = process.env.CASSANDRA_KEYSPACE || "tgosint";

  const bootstrapStatements = statements.filter((statement) => !/^USE\s+/i.test(statement));
  const baseClient = buildClient();

  try {
    await baseClient.connect();
    for (const statement of bootstrapStatements.filter((item) => /^CREATE KEYSPACE/i.test(item))) {
      await executeWithRetry(baseClient, statement);
    }
  } finally {
    await baseClient.shutdown();
  }

  const keyspaceClient = buildClient(configuredKeyspace);
  try {
    await keyspaceClient.connect();
    for (const statement of bootstrapStatements.filter((item) => !/^CREATE KEYSPACE/i.test(item))) {
      await executeWithRetry(keyspaceClient, statement);
    }
    console.log(`[cassandra:init] Applied schema to keyspace ${configuredKeyspace}.`);
  } finally {
    await keyspaceClient.shutdown();
  }
}

main().catch((error) => {
  console.error("[cassandra:init] Failed:", error);
  process.exit(1);
});
