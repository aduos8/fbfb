import { sql } from '../db';

export interface Redaction {
  id: string;
  target_type: 'user' | 'channel' | 'group';
  target_id: string;
  redaction_type: 'full' | 'partial' | 'masked';
  redacted_fields: string[];
  reason: string | null;
  created_by: string;
  created_at: Date;
  is_active?: boolean;
}

export type RedactionTargetType = 'user' | 'channel' | 'group';
export type RedactionType = 'full' | 'partial' | 'masked';

export const CANONICAL_REDACTION_FIELDS = [
  'userId',
  'username',
  'displayName',
  'bio',
  'profilePhoto',
  'phone',
  'messages',
  'groups',
  'channels',
] as const;

const DB_FIELD_ALIASES: Record<string, string> = {
  telegramUserId: 'userId',
  user_id: 'userId',
  uid: 'userId',
  user_name: 'username',
  userName: 'username',
  display_name: 'displayName',
  displayname: 'displayName',
  name: 'displayName',
  title: 'displayName',
  channel_title: 'displayName',
  group_title: 'displayName',
  description: 'bio',
  about: 'bio',
  avatar: 'profilePhoto',
  avatar_url: 'profilePhoto',
  avatarUrl: 'profilePhoto',
  profile_photo: 'profilePhoto',
  photo_url: 'profilePhoto',
  phone_number: 'phone',
  phoneNumber: 'phone',
  phone_hash: 'phone',
  phoneHash: 'phone',
  phone_masked: 'phone',
  phoneMasked: 'phone',
  content: 'messages',
  message_content: 'messages',
  message: 'messages',
  text: 'messages',
  active_chats: 'groups',
  activeChats: 'groups',
  user_groups: 'groups',
  subscribed_channels: 'channels',
};

function normalizeRedactionFields(redactionType: RedactionType, redactedFields: string[] = []) {
  if (redactionType === 'full') {
    return [...CANONICAL_REDACTION_FIELDS];
  }

  const canonicalLowerSet = new Set(CANONICAL_REDACTION_FIELDS.map(f => f.toLowerCase()));
  const canonicalMap = new Map(CANONICAL_REDACTION_FIELDS.map(f => [f.toLowerCase(), f]));

  const normalizedFields = redactedFields.map(field => {
    const fieldLower = field.toLowerCase();
    const alias = DB_FIELD_ALIASES[field];
    if (alias) {
      return canonicalMap.get(alias.toLowerCase()) ?? alias;
    }
    if (canonicalLowerSet.has(fieldLower)) {
      return canonicalMap.get(fieldLower)!;
    }
    const canonical = CANONICAL_REDACTION_FIELDS.find(f => f.toLowerCase() === fieldLower);
    return canonical ?? null;
  }).filter((f): f is string => f !== null);

  const droppedFields = redactedFields.filter(field => {
    const normalized = normalizedFields.find(f => f.toLowerCase() === field.toLowerCase());
    return !normalized;
  });

  if (droppedFields.length > 0) {
    console.error(`[redaction] Unknown redaction fields dropped: ${JSON.stringify(droppedFields)}`);
  }

  return [...new Set(normalizedFields)];
}

export async function upsertRedaction(input: {
  targetType: RedactionTargetType;
  targetId: string;
  redactionType: RedactionType;
  redactedFields?: string[];
  reason: string;
  actorId: string;
}): Promise<Redaction> {
  const fields = normalizeRedactionFields(input.redactionType, input.redactedFields ?? []);

  return sql.begin(async (trx) => {
    const [row] = await trx<Redaction[]>`
      INSERT INTO redactions (target_type, target_id, redaction_type, redacted_fields, reason, created_by, is_active)
      VALUES (${input.targetType}, ${input.targetId}, ${input.redactionType}, ${fields}, ${input.reason}, ${input.actorId}, true)
      ON CONFLICT (target_type, target_id)
      DO UPDATE SET
        redaction_type = EXCLUDED.redaction_type,
        redacted_fields = EXCLUDED.redacted_fields,
        reason = EXCLUDED.reason,
        is_active = true
      RETURNING id, target_type, target_id, redaction_type, redacted_fields, reason, created_by, created_at, COALESCE(is_active, true) as is_active
    `;

    await trx`
      INSERT INTO audit_logs (admin_id, action, target_type, target_id, after_value)
      VALUES (
        ${input.actorId},
        ${input.redactionType === 'full' ? 'full_redact' : input.redactionType === 'masked' ? 'masked_redact' : 'partial_redact'},
        ${input.targetType},
        ${input.targetId},
        ${JSON.stringify({ fields, reason: input.reason })}::jsonb
      )
    `;

    return row;
  });
}

export async function createRedaction(
  targetType: RedactionTargetType,
  targetId: string,
  redactionType: RedactionType,
  redactedFields: string[],
  reason: string,
  createdBy: string
): Promise<Redaction> {
  return upsertRedaction({
    targetType,
    targetId,
    redactionType,
    redactedFields,
    reason,
    actorId: createdBy,
  });
}

export async function getRedaction(
  targetType: string,
  targetId: string
): Promise<Redaction | null> {
  const [row] = await sql<Redaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, reason, created_by, created_at, COALESCE(is_active, true) as is_active
    FROM redactions WHERE target_type = ${targetType} AND target_id = ${targetId}
  `;
  return row ?? null;
}

export async function listRedactions(): Promise<Redaction[]> {
  return sql<Redaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, reason, created_by, created_at, COALESCE(is_active, true) as is_active
    FROM redactions ORDER BY created_at DESC
  `;
}

export async function listRedactionsByType(targetType?: RedactionTargetType): Promise<Redaction[]> {
  if (!targetType) {
    return listRedactions();
  }

  return sql<Redaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, reason, created_by, created_at, COALESCE(is_active, true) as is_active
    FROM redactions
    WHERE target_type = ${targetType}
    ORDER BY created_at DESC
  `;
}

export async function getRedactionById(id: string): Promise<Redaction | null> {
  const [row] = await sql<Redaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, reason, created_by, created_at, COALESCE(is_active, true) as is_active
    FROM redactions
    WHERE id = ${id}
  `;
  return row ?? null;
}

export async function removeRedactionByTarget(input: {
  targetType: RedactionTargetType;
  targetId: string;
  actorId: string;
}): Promise<void> {
  await sql.begin(async (trx) => {
    await trx`
      DELETE FROM redactions
      WHERE target_type = ${input.targetType}
        AND target_id = ${input.targetId}
    `;

    await trx`
      INSERT INTO audit_logs (admin_id, action, target_type, target_id)
      VALUES (${input.actorId}, 'redaction_remove', ${input.targetType}, ${input.targetId})
    `;
  });
}

export async function removeRedaction(id: string, actorId?: string | null): Promise<void> {
  if (!actorId) {
    await sql`DELETE FROM redactions WHERE id = ${id}`;
    return;
  }

  const existing = await getRedactionById(id);
  if (!existing) {
    return;
  }

  await removeRedactionByTarget({
    targetType: existing.target_type,
    targetId: existing.target_id,
    actorId,
  });
}

export function applyRedaction<T extends Record<string, unknown>>(
  entity: T,
  redaction: Redaction | null,
  defaultType: string
): T {
  if (!redaction) return entity;

  if (redaction.redaction_type === 'full') {
    return {
      ...entity,
      username: '[Redacted]',
      displayName: 'Redacted User',
      bio: null,
      avatarUrl: null,
    } as T;
  }

  const result = { ...entity };
  for (const field of redaction.redacted_fields) {
    if (field in result) {
      (result as Record<string, unknown>)[field] = '[Redacted]';
    }
  }
  return result;
}

export async function deactivateRedaction(
  targetType: RedactionTargetType,
  targetId: string,
  actorId: string
): Promise<void> {
  await sql.begin(async (trx) => {
    await trx`
      UPDATE redactions
      SET is_active = false
      WHERE target_type = ${targetType}
        AND target_id = ${targetId}
    `;

    await trx`
      INSERT INTO audit_logs (admin_id, action, target_type, target_id)
      VALUES (${actorId}, 'redaction_deactivate', ${targetType}, ${targetId})
    `;
  });
}

export async function reactivateRedaction(
  targetType: RedactionTargetType,
  targetId: string,
  actorId: string
): Promise<void> {
  await sql.begin(async (trx) => {
    await trx`
      UPDATE redactions
      SET is_active = true
      WHERE target_type = ${targetType}
        AND target_id = ${targetId}
    `;

    await trx`
      INSERT INTO audit_logs (admin_id, action, target_type, target_id)
      VALUES (${actorId}, 'redaction_reactivate', ${targetType}, ${targetId})
    `;
  });
}
