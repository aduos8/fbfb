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

const REDACTED_VALUE = "[redacted]";

function redactObjectField(target: Record<string, unknown>, objectKey: string, fieldKey: string, value: unknown) {
  const nested = target[objectKey];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    target[objectKey] = {
      ...(nested as Record<string, unknown>),
      [fieldKey]: value,
    };
  }
}

function redactIdentityFields(target: Record<string, unknown>, fields: Set<RedactedField>) {
  if (fields.has("userId")) {
    target.telegramUserId = null;
    target.userId = null;
    redactObjectField(target, "sender", "userId", null);
  }

  if (fields.has("username")) {
    target.username = REDACTED_VALUE;
    redactObjectField(target, "sender", "username", REDACTED_VALUE);
    redactObjectField(target, "chat", "username", REDACTED_VALUE);
  }

  if (fields.has("displayName")) {
    target.displayName = REDACTED_VALUE;
    target.display_name = REDACTED_VALUE;
    target.channelTitle = REDACTED_VALUE;
    target.groupTitle = REDACTED_VALUE;
    target.title = REDACTED_VALUE;
    redactObjectField(target, "sender", "displayName", REDACTED_VALUE);
    redactObjectField(target, "chat", "title", REDACTED_VALUE);
  }

  if (fields.has("bio")) {
    target.bio = REDACTED_VALUE;
    target.description = REDACTED_VALUE;
    target.channelDescription = REDACTED_VALUE;
    target.groupDescription = REDACTED_VALUE;
  }

  if (fields.has("profilePhoto")) {
    target.profilePhoto = null;
    target.avatar_url = null;
    target.avatarUrl = null;
    target.profile_photo = null;
  }

  if (fields.has("phone")) {
    target.phoneMasked = REDACTED_VALUE;
  }

  if (fields.has("messages")) {
    target.content = REDACTED_VALUE;
    target.snippet = REDACTED_VALUE;
    target.highlightedSnippet = REDACTED_VALUE;
    target.matchedTerms = [];
  }

  if (fields.has("groups") && Array.isArray(target.groups)) {
    target.groups = [];
  }

  if (fields.has("channels") && Array.isArray(target.channels)) {
    target.channels = [];
  }

  if (fields.has("groups") && Array.isArray(target.activeChats)) {
    target.activeChats = [];
  }
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
  return Boolean(redaction && redaction.type === "full" && !canBypassResolvedRedactions(viewer));
}

export function canBypassResolvedRedactions(viewer: ViewerAccess) {
  const forceApplyRedactions = process.env.FORCE_APPLY_REDACTIONS === "true";
  const allowRedactionBypass = process.env.ALLOW_REDACTION_BYPASS === "true";
  return viewer.canBypassRedactions && allowRedactionBypass && !forceApplyRedactions;
}

export function applyResolvedRedaction<T extends Record<string, unknown>>(
  record: T,
  redaction: ResolvedRedaction | null | undefined,
  viewer: ViewerAccess
): (T & { redaction: RedactionMetadata; isMasked?: boolean; maskedType?: string }) | null {
  const metadata = buildRedactionMetadata(redaction);

  const bypassRedactions = canBypassResolvedRedactions(viewer);

  if (!redaction || bypassRedactions) {
    return {
      ...record,
      redaction: metadata,
    };
  }

  if (redaction.type === "full") {
    return null;
  }

  const fields = new Set(redaction.fields);

  if (redaction.type === "masked") {
    const masked = { ...record } as Record<string, unknown>;
    redactIdentityFields(masked, fields.size > 0 ? fields : new Set(fullRedactionFields()));
    masked.telegramUserId = null;
    masked.userId = null;
    redactObjectField(masked, "sender", "userId", null);
    return {
      ...(masked as T),
      redaction: metadata,
      isMasked: true,
      maskedType: "record_unavailable" as const,
    };
  }

  const next = { ...record } as Record<string, unknown>;
  redactIdentityFields(next, fields);

  return {
    ...(next as T),
    redaction: metadata,
  };
}
