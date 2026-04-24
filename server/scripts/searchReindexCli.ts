function stripWrappingQuotes(value: string) {
  return value.replace(/^['"]+|['"]+$/g, "");
}

function getBunArgv() {
  const runtime = globalThis as typeof globalThis & {
    Bun?: {
      argv?: string[];
    };
  };

  return Array.isArray(runtime.Bun?.argv) ? runtime.Bun.argv : [];
}

export function getSearchReindexCliArgs(
  processArgv: string[] = process.argv,
  bunArgv: string[] = getBunArgv()
) {
  const raw = [...processArgv, ...bunArgv];
  const normalized: string[] = [];

  for (const value of raw) {
    const cleaned = stripWrappingQuotes(String(value ?? "").trim());
    if (!cleaned) {
      continue;
    }

    const parts = cleaned.includes(" --")
      ? cleaned.split(/\s+/)
      : [cleaned];

    for (const part of parts) {
      const token = stripWrappingQuotes(part.trim());
      if (token) {
        normalized.push(token);
      }
    }
  }

  return normalized;
}

export function parseScopesFromArgs(argv: string[]) {
  const scopeArgIndex = argv.findIndex((value) => value.startsWith("--scopes=") || value === "--scopes");
  if (scopeArgIndex === -1) {
    return undefined;
  }

  const scopeValue = argv[scopeArgIndex]?.startsWith("--scopes=")
    ? argv[scopeArgIndex].slice("--scopes=".length)
    : argv[scopeArgIndex + 1];
  if (!scopeValue) {
    return undefined;
  }

  const scopes = scopeValue
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is "profiles" | "chats" | "messages" =>
      ["profiles", "chats", "messages"].includes(value)
    );

  return scopes.length > 0 ? scopes : undefined;
}

export function hasCliFlag(argv: string[], flag: string) {
  return argv.includes(flag);
}

export function parseRunIdFromArgs(argv: string[]) {
  const runIdArgIndex = argv.findIndex((value) => value.startsWith("--run-id=") || value === "--run-id");
  if (runIdArgIndex === -1) {
    return undefined;
  }

  const runId = argv[runIdArgIndex]?.startsWith("--run-id=")
    ? argv[runIdArgIndex].slice("--run-id=".length).trim()
    : (argv[runIdArgIndex + 1] ?? "").trim();
  return runId.length > 0 ? runId : undefined;
}
