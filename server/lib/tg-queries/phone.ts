import { createHash } from "node:crypto";

export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("+")) {
    const trimmed = `+${digits.slice(1).replace(/\D/g, "")}`;
    return trimmed.length > 1 ? trimmed : null;
  }

  const normalized = digits.replace(/\D/g, "");
  return normalized || null;
}

export function hashPhoneNumber(value: string | null | undefined): string | null {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) {
    return null;
  }

  return createHash("sha256").update(normalized).digest("hex");
}

export function maskPhoneNumber(value: string | null | undefined): string | null {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) {
    return null;
  }

  const hasPlus = normalized.startsWith("+");
  const digits = hasPlus ? normalized.slice(1) : normalized;
  if (digits.length <= 4) {
    return `${hasPlus ? "+" : ""}${digits}`;
  }

  const visiblePrefixLength = 1;
  const visiblePrefix = digits.slice(0, visiblePrefixLength);
  const visibleSuffix = digits.slice(-4);
  const masked = `${visiblePrefix}${"*".repeat(Math.max(2, digits.length - visiblePrefixLength - 4))}${visibleSuffix}`;

  return `${hasPlus ? "+" : ""}${masked}`;
}
