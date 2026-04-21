export function cleanSearchValue(value: string | undefined | null) {
  return value?.trim() || undefined;
}

export function normalizeHandle(value: string | undefined | null) {
  const cleaned = cleanSearchValue(value);
  return cleaned?.replace(/^@/, "").toLowerCase();
}

export function isTelegramId(value: string | undefined | null) {
  return Boolean(value && /^-?\d+$/.test(value.trim()));
}

export function classifyQuery(value: string | undefined | null) {
  const query = cleanSearchValue(value);
  return {
    query,
    isHandle: Boolean(query?.startsWith("@")),
    isNumeric: isTelegramId(query),
  };
}

export function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 90) {
    return "high";
  }
  if (score >= 55) {
    return "medium";
  }
  return "low";
}

export function snippetFromText(value: string | null | undefined, query: string | undefined, maxLength = 180) {
  const content = String(value ?? "");
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) {
    return content.slice(0, maxLength);
  }

  const lower = content.toLowerCase();
  const matchIndex = lower.indexOf(normalizedQuery);
  if (matchIndex === -1) {
    return content.slice(0, maxLength);
  }

  const start = Math.max(0, matchIndex - Math.floor((maxLength - normalizedQuery.length) / 2));
  const end = Math.min(content.length, start + maxLength);
  return content.slice(start, end).trim();
}

export function highlightSnippet(value: string, query: string | undefined) {
  const escapedValue = String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (!query) {
    return escapedValue;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escapedValue.replace(new RegExp(escaped, "gi"), (match) => `<mark>${match}</mark>`);
}

export function containsLink(value: string | null | undefined) {
  return /https?:\/\/[^\s]+/i.test(String(value ?? ""));
}
