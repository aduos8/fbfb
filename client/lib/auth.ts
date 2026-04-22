const AUTH_STATE_COOKIE = "auth_state";

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

export function getToken(): string | null {
  return null;
}

export function setToken(_t: string): void {
  setCookie(AUTH_STATE_COOKIE, "1", 7 * 24 * 60 * 60);
}

export function clearToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_STATE_COOKIE}=0; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isAuthenticated(): boolean {
  return getCookieValue(AUTH_STATE_COOKIE) === "1";
}

export function setUserRole(_role: string): void {
}

export function getUserRole(): string | null {
  return null;
}

export function isAdmin(): boolean {
  return false;
}

export function isOwner(): boolean {
  return false;
}
