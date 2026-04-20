type ViewerRole = "user" | "admin" | "owner";

export const CACHE_TTL = 60;

export type RedactionRecord = {
  entity_type?: string;
  entity_id?: string;
  redacted_fields?: unknown;
  reason?: string;
};

function normalizeRedactedFields(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      return [value];
    }
  }

  return [];
}

export function isFullRedaction(redaction?: RedactionRecord | null) {
  if (!redaction) {
    return false;
  }

  const fields = normalizeRedactedFields(redaction.redacted_fields);
  return fields.length === 0 || fields.includes("__full__");
}

export function applyRedactions<T extends Record<string, unknown>>(
  record: T | null,
  redaction: RedactionRecord | null | undefined,
  role: ViewerRole
): T | { message: string } | null {
  if (!record) {
    return null;
  }

  if (role === "admin" || role === "owner") {
    return record;
  }

  if (isFullRedaction(redaction)) {
    return { message: "Record unavailable" };
  }

  const fields = normalizeRedactedFields(redaction?.redacted_fields);
  if (fields.length === 0) {
    return record;
  }

  const nextRecord = {
    ...record,
    username: fields.includes("username") ? "[redacted]" : record.username,
    bio: fields.includes("bio") ? "[redacted]" : record.bio,
    description: fields.includes("bio") ? "[redacted]" : record.description,
    avatar: fields.includes("avatar") ? null : record.avatar,
    avatar_url: fields.includes("avatar") ? null : record.avatar_url,
    photo_id: fields.includes("avatar") ? null : record.photo_id,
    content: fields.includes("messages") ? "[redacted]" : record.content,
  };
  const mutableRecord = nextRecord as Record<string, unknown>;

  if (fields.includes("groups")) {
    if (Array.isArray(mutableRecord.groups)) {
      mutableRecord.groups = [];
    }

    if (Array.isArray(mutableRecord.activeChats)) {
      mutableRecord.activeChats = [];
    }
  }

  return mutableRecord as T;
}
