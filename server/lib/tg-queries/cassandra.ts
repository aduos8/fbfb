import { Client, auth } from "cassandra-driver";

const DEFAULT_KEYSPACE = "tgosint";
let sharedClient: Client | null = null;

export function getCassandraClient(): Client {
  if (!sharedClient) {
    const contactPoints = (process.env.CASSANDRA_CONTACT_POINTS || "localhost").split(",").map(v => v.trim()).filter(Boolean);
    const keyspace = process.env.CASSANDRA_KEYSPACE || DEFAULT_KEYSPACE;
    const username = process.env.CASSANDRA_USERNAME || "";
    const password = process.env.CASSANDRA_PASSWORD || "";

    const options: Record<string, unknown> = {
      contactPoints,
      localDataCenter: process.env.CASSANDRA_LOCAL_DC || "datacenter1",
      keyspace,
      pooling: {
        maxRequestsPerConnection: 1024,
      },
    };

    if (username && password) {
      options.authProvider = new auth.PlainTextAuthProvider(username, password);
    }

    sharedClient = new Client(options);
  }
  return sharedClient;
}

export function cassandra() {
  return getCassandraClient();
}

export async function shutdownCassandra() {
  if (sharedClient) {
    await sharedClient.shutdown();
    sharedClient = null;
  }
}

export type CassandraClientHandle = {
  execute: <TRow = Record<string, unknown>>(
    query: string,
    params?: unknown[],
    options?: { prepare?: boolean }
  ) => Promise<TRow[]>;
};
