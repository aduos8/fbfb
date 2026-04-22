const K = "auth_state";

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${K}=`;
  const match = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export function setToken(t: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${K}=1; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function removeToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${K}=0; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isAuthed(): boolean {
  return getToken() === "1";
}

export function getCsrf(): string | null {
  if (typeof window === "undefined") return null;
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute("content") ?? null;
}

export function setCsrf(t: string): void {
  if (typeof window === "undefined") return;
  let meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "csrf-token";
    document.head.appendChild(meta);
  }
  meta.content = t;
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validUsername(u: string): boolean {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(u);
}

export function cleanInput(s: string): string {
  return s.trim().slice(0, 1000);
}

export function validUrl(url: string): boolean {
  try {
    const p = new URL(url);
    return ["http:", "https:"].includes(p.protocol);
  } catch {
    return false;
  }
}
