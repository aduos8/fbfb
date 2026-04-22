type ErrorWithMessage = {
  message?: unknown;
};

function normalizeIssuePath(path: unknown): string {
  if (!Array.isArray(path) || path.length === 0) return "";
  return path
    .map((segment) => String(segment))
    .filter(Boolean)
    .join(".");
}

function maybeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getUserFriendlyErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const rawMessage = (error as ErrorWithMessage).message;
  if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    return fallback;
  }

  const parsed = maybeParseJson(rawMessage);
  if (Array.isArray(parsed) && parsed.length > 0) {
    const firstIssue = parsed[0] as { message?: unknown; path?: unknown };
    const issueMessage = typeof firstIssue?.message === "string" ? firstIssue.message : "";
    const issuePath = normalizeIssuePath(firstIssue?.path);

    if (issuePath && issueMessage) {
      if (issuePath === "email" && issueMessage.toLowerCase() === "invalid email") {
        return "Please enter a valid email address.";
      }
      return `${issuePath}: ${issueMessage}`;
    }

    if (issueMessage) {
      return issueMessage;
    }
  }

  if (rawMessage.toLowerCase() === "invalid email") {
    return "Please enter a valid email address.";
  }

  return rawMessage;
}
