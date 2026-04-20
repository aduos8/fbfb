import { sql } from '../db';

export interface Redaction {
  id: string;
  target_type: 'user' | 'channel' | 'group';
  target_id: string;
  redaction_type: 'full' | 'partial';
  redacted_fields: string[];
  created_by: string;
  created_at: Date;
}

export async function createRedaction(
  targetType: 'user' | 'channel' | 'group',
  targetId: string,
  redactionType: 'full' | 'partial',
  redactedFields: string[],
  createdBy: string
): Promise<Redaction> {
  const [row] = await sql<Redaction[]>`
    INSERT INTO redactions (target_type, target_id, redaction_type, redacted_fields, created_by)
    VALUES (${targetType}, ${targetId}, ${redactionType}, ${redactedFields}, ${createdBy})
    RETURNING id, target_type, target_id, redaction_type, redacted_fields, created_by, created_at
  `;
  return row;
}

export async function getRedaction(
  targetType: string,
  targetId: string
): Promise<Redaction | null> {
  const [row] = await sql<Redaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, created_by, created_at
    FROM redactions WHERE target_type = ${targetType} AND target_id = ${targetId}
  `;
  return row ?? null;
}

export async function listRedactions(): Promise<Redaction[]> {
  return sql<Redaction[]>`
    SELECT id, target_type, target_id, redaction_type, redacted_fields, created_by, created_at
    FROM redactions ORDER BY created_at DESC
  `;
}

export async function removeRedaction(id: string): Promise<void> {
  await sql`DELETE FROM redactions WHERE id = ${id}`;
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
