const K = "auth_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(K);
}

export function setToken(t: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(K, t);
}

export function removeToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(K);
}

export function isAuthed(): boolean {
  const t = getToken();
  if (!t) return false;
  return t.length >= 32 && t.length <= 512 && /^[a-f0-9]+$/i.test(t);
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
