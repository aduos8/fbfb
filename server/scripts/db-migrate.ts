import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

function splitSqlStatements(input: string) {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const previous = input[index - 1];

    if (char === "'" && previous !== "\\" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && previous !== "\\" && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (char === ";" && !inSingleQuote && !inDoubleQuote) {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

async function runSqlFile(sql: postgres.Sql, filePath: string) {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  for (const statement of splitSqlStatements(lines)) {
    await sql.unsafe(statement);
  }
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required");
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const schemaFile = path.join(repoRoot, "server/schema.sql");
  const migrationsDir = path.join(repoRoot, "server/migrations");
  const migrationFiles = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const sql = postgres(process.env.POSTGRES_URL, { ssl: false, max: 1 });

  try {
    await runSqlFile(sql, schemaFile);
    for (const file of migrationFiles) {
      await runSqlFile(sql, path.join(migrationsDir, file));
    }
    console.log(`Applied schema and ${migrationFiles.length} migration file(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[db:migrate] Failed:", error);
  process.exit(1);
});
