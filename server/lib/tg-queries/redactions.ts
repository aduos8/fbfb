import { sql } from "../db";
import type { RedactedField, RedactionMetadata } from "../../../shared/api";
import type { ViewerAccess } from "./viewer";

export type RedactionTargetType = "user" | "channel" | "group" | "message";

type DatabaseRedaction = {
  id: string;
  target_type: "user" | "channel" | "group";
  target_id: string;
  redaction_type: "full" | "partial" | "masked";
  redacted_fields: string[] | string | null;
  reason: string | null;
  is_active?: boolean;
};

export type ResolvedRedaction = {
  id: string;
  targetType: "user" | "channel" | "group";
  targetId: string;
  type: "full" | "partial" | "masked";
  fields: RedactedField[];
  reason: string | null;
};

const FIELD_ALIASES: Record<string, RedactedField> = {
  userId: "userId",
  telegramUserId: "userId",
  user_id: "userId",
  uid: "userId",
  username: "username",
  user_name: "username",
  userName: "username",
  display_name: "displayName",
  displayName: "displayName",
  displayname: "displayName",
  name: "displayName",
  title: "displayName",
  channel_title: "displayName",
  group_title: "displayName",
  channelTitle: "displayName",
  groupTitle: "displayName",
  bio: "bio",
  description: "bio",
  bio_text: "bio",
  about: "bio",
  channelDescription: "bio",
  groupDescription: "bio",
  avatar: "profilePhoto",
  avatar_url: "profilePhoto",
  avatarurl: "profilePhoto",
  avatarUrl: "profilePhoto",
  profile_photo: "profilePhoto",
  profile_photo_url: "profilePhoto",
  profilePhoto: "profilePhoto",
  photo_url: "profilePhoto",
  photoUrl: "profilePhoto",
  phone: "phone",
  phone_number: "phone",
  phonenumber: "phone",
  phoneNumber: "phone",
  phone_hash: "phone",
  phonehash: "phone",
  phoneHash: "phone",
  phone_masked: "phone",
  phonemasked: "phone",
  phoneMasked: "phone",
  content: "messages",
  messages: "messages",
  message_content: "messages",
  message: "messages",
  text: "messages",
  groups: "groups",
  active_chats: "groups",
  activechats: "groups",
  activeChats: "groups",
  user_groups: "groups",
  channels: "channels",
  subscribed_channels: "channels",
};

export function normalizeRedactedFields(value: string[] | string | null | undefined): RedactedField[] {
  const input = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        })()
      : [];

  const mapped = input.flatMap((field) => {
    const str = String(field);
    const canonical = FIELD_ALIASES[str];
    if (canonical) {
      return [canonical];
    }
    const lower = str.toLowerCase();
    const lowerCanonical = FIELD_ALIASES[lower];
    if (lowerCanonical) {
      return [lowerCanonical];
    }
    console.warn(`Unknown redaction field "${field}" - ignoring`);
    return [];
  });

  return Array.from(new Set(mapped));
}

function fullRedactionFields(): RedactedField[] {
  return ["userId", "username", "displayName", "bio", "profilePhoto", "phone", "messages", "groups", "channels"];
}

export function buildRedactionMetadata(redaction?: ResolvedRedaction | null): RedactionMetadata {
  if (!redaction) {
    return {
      applied: false,
      type: "none",
      redactedFields: [],
      reason: null,
    };
  }

  return {
    applied: true,
    type: redaction.type,
    redactedFields: redaction.fields,
    reason: redaction.reason ?? null,
  };
}

function resolveRedaction(row: DatabaseRedaction): ResolvedRedaction {
  const fields = normalizeRedactedFields(row.redacted_fields);

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    type: row.redaction_type,
    fields: row.redaction_type === "full" ? fullRedactionFields() : fields,
    reason: row.reason ?? null,
  };
}

export async function loadRedactionMap(
  targetType: "user" | "channel" | "group",
  targetIds: string[]
): Promise<Map<string, ResolvedRedaction>> {
  const ids = Array.from(new Set(targetIds.filter(Boolean)));
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await sql<DatabaseRedaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, reason, COALESCE(is_active, true) as is_active
    FROM redactions
    WHERE target_type = ${targetType}
      AND target_id IN ${sql(ids)}
      AND COALESCE(is_active, true) = true
  `;

  return new Map(rows.map((row) => {
    const resolved = resolveRedaction(row);
    return [resolved.targetId, resolved] as const;
  }));
}

export async function loadSingleRedaction(
  targetType: "user" | "channel" | "group",
  targetId: string
): Promise<ResolvedRedaction | null> {
  if (!targetId) {
    return null;
  }

  const [row] = await sql<DatabaseRedaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, reason, COALESCE(is_active, true) as is_active
    FROM redactions
    WHERE target_type = ${targetType}
      AND target_id = ${targetId}
      AND COALESCE(is_active, true) = true
    LIMIT 1
  `;

  return row ? resolveRedaction(row) : null;
}

export function shouldHideRecord(
  redaction: ResolvedRedaction | null | undefined,
  viewer: ViewerAccess
) {
  return Boolean(redaction && redaction.type === "full" && !viewer.canBypassRedactions);
}

export function applyResolvedRedaction<T extends Record<string, unknown>>(
  record: T,
  redaction: ResolvedRedaction | null | undefined,
  viewer: ViewerAccess
): (T & { redaction: RedactionMetadata; isMasked?: boolean; maskedType?: string }) | null {
  const metadata = buildRedactionMetadata(redaction);

  const forceApplyRedactions = process.env.FORCE_APPLY_REDACTIONS === "true";
  const bypassRedactions = viewer.canBypassRedactions && !forceApplyRedactions;

  console.log(`[redaction-debug] applyResolvedRedaction`, {
    hasRedaction: !!redaction,
    redactionType: redaction?.type,
    viewerCanBypass: viewer.canBypassRedactions,
    forceApplyRedactions,
    bypassRedactions,
    originalUsername: (record as any).username,
    originalDisplayName: (record as any).displayName,
  });

  if (!redaction || bypassRedactions) {
    return {
      ...record,
      redaction: metadata,
    };
  }

  if (redaction.type === "full") {
    console.log(`[redaction-debug] returning null for full redaction`);
    return null;
  }

  if (redaction.type === "masked") {
    console.log(`[redaction-debug] returning masked result for masked redaction`);
    const masked = { ...record } as Record<string, unknown>;
    masked.username = null;
    masked.displayName = "Record unavailable";
    masked.display_name = "Record unavailable";
    masked.channelTitle = "Record unavailable";
    masked.groupTitle = "Record unavailable";
    masked.title = "Record unavailable";
    masked.bio = null;
    masked.description = null;
    masked.channelDescription = null;
    masked.groupDescription = null;
    masked.profilePhoto = null;
    masked.avatar_url = null;
    masked.avatarUrl = null;
    masked.profile_photo = null;
    masked.telegramUserId = null;
    masked.userId = null;
    masked.phoneMasked = null;
    masked.content = null;
    masked.snippet = null;
    masked.highlightedSnippet = null;
    masked.matchedTerms = [];
    masked.groups = [];
    masked.activeChats = [];
    masked.channels = [];
    return {
      ...(masked as T),
      redaction: metadata,
      isMasked: true,
      maskedType: "record_unavailable" as const,
    };
  }

  const next = { ...record } as Record<string, unknown>;
  const fields = new Set(redaction.fields);

  if (fields.has("userId")) {
    next.telegramUserId = null;
    next.userId = null;
  }

  if (fields.has("username")) {
    next.username = "[redacted]";
  }

  if (fields.has("displayName")) {
    next.displayName = "[redacted]";
    next.display_name = "[redacted]";
    next.channelTitle = "[redacted]";
    next.groupTitle = "[redacted]";
    next.title = "[redacted]";
  }

  if (fields.has("bio")) {
    next.bio = "[redacted]";
    next.description = "[redacted]";
    next.channelDescription = "[redacted]";
    next.groupDescription = "[redacted]";
  }

  if (fields.has("profilePhoto")) {
    next.profilePhoto = null;
    next.avatar_url = null;
    next.avatarUrl = null;
    next.profile_photo = null;
  }

  if (fields.has("phone")) {
    next.phoneMasked = "[redacted]";
  }

  if (fields.has("messages")) {
    next.content = "[redacted]";
    next.snippet = "[redacted]";
    next.highlightedSnippet = "[redacted]";
    next.matchedTerms = [];
  }

  if (fields.has("groups") && Array.isArray(next.groups)) {
    next.groups = [];
  }

  if (fields.has("channels") && Array.isArray(next.channels)) {
    next.channels = [];
  }

  if (fields.has("groups") && Array.isArray(next.activeChats)) {
    next.activeChats = [];
  }

  return {
    ...(next as T),
    redaction: metadata,
  };
}
