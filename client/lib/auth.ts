const TOKEN_KEY = 'auth_token';
const USER_ROLE_KEY = 'auth_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ROLE_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function setUserRole(role: string): void {
  localStorage.setItem(USER_ROLE_KEY, role);
}

export function getUserRole(): string | null {
  return localStorage.getItem(USER_ROLE_KEY);
}

export function isAdmin(): boolean {
  const role = getUserRole();
  return role === 'admin' || role === 'owner';
}

export function isOwner(): boolean {
  return getUserRole() === 'owner';
}
