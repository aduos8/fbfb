const STORAGE_BASE_URL = process.env.STORAGE_BASE_URL || "https://assets.example.com";

export function toApiServedAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${STORAGE_BASE_URL}/${path}`;
}

export function toStoragePath(entityType: string, entityId: string, filename: string): string {
  return `${entityType}/${entityId}/${filename}`;
}
