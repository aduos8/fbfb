import postgres from "postgres";

const connectionUrl = process.env.POSTGRES_URL;

if (!connectionUrl) {
  throw new Error("POSTGRES_URL environment variable is not set");
}

export const sql = postgres(connectionUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: false,
});

export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (err) {
    console.error("PostgreSQL connection failed:", err);
    return false;
  }
}

export async function closeConnection(): Promise<void> {
  await sql.end();
}
