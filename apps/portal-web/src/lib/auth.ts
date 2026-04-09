import { cookies } from "next/headers";

export type PortalSessionUser = {
  id: string;
  credentialId: string;
  email: string;
  displayName: string;
  clearanceLevel: number;
  status?: string;
};

type BackendTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type BackendLoginResult =
  | (BackendTokenPair & { mfaRequired: false })
  | { mfaRequired: true; mfaToken: string };

export type LoginOutcome =
  | { status: "ok"; user: PortalSessionUser }
  | { status: "mfa_required" };

type CookieWriter = {
  set: Awaited<ReturnType<typeof cookies>>["set"];
  delete: Awaited<ReturnType<typeof cookies>>["delete"];
};

const SESSION_COOKIE = "portal_access_token";
const REFRESH_COOKIE = "portal_refresh_token";
const EXPIRES_COOKIE = "portal_access_expires_at";
const USER_COOKIE = "portal_user";
const MFA_PENDING_COOKIE = "portal_mfa_token";

const defaultCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function getBackendBaseUrl() {
  return process.env.PORTAL_BACKEND_URL ?? "http://localhost:4000/api/v1";
}

async function backendJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    // Abort requests that take longer than 10 s — prevents server action hangs
    signal: init.signal ?? AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Backend request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function backendJsonForPortal<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return backendJson<T>(path, init);
}

export async function authorizedBackendJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await getSession();

  if (!session?.accessToken) {
    throw new Error("AUTH_REQUIRED");
  }

  return backendJson<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

function parsePortalUser(rawValue: string | undefined): PortalSessionUser | null {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PortalSessionUser;
  } catch {
    return null;
  }
}

async function fetchOwnProfile(accessToken: string): Promise<PortalSessionUser> {
  const profile = await backendJson<{
    id: string;
    credentialId: string;
    email: string;
    displayName: string | null;
    firstName?: string | null;
    lastName?: string | null;
    clearanceLevel?: number;
    status?: string;
  }>("/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return {
    id: profile.id,
    credentialId: profile.credentialId,
    email: profile.email,
    displayName:
      profile.displayName ??
      [profile.firstName, profile.lastName].filter(Boolean).join(" ") ??
      profile.email,
    clearanceLevel: profile.clearanceLevel ?? 0,
    status: profile.status,
  };
}

async function persistSession(
  cookieStore: CookieWriter,
  tokens: BackendTokenPair,
  user: PortalSessionUser,
) {
  cookieStore.set(SESSION_COOKIE, tokens.accessToken, {
    ...defaultCookieOptions,
    maxAge: tokens.expiresIn,
  });
  cookieStore.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...defaultCookieOptions,
    maxAge: 60 * 60 * 24 * 7,
  });
  cookieStore.set(EXPIRES_COOKIE, String(Date.now() + tokens.expiresIn * 1000), {
    ...defaultCookieOptions,
    maxAge: tokens.expiresIn,
  });
  cookieStore.set(USER_COOKIE, JSON.stringify(user), {
    ...defaultCookieOptions,
    maxAge: tokens.expiresIn,
  });
}

export async function clearSessionCookies(cookieStore?: CookieWriter) {
  const target = cookieStore ?? (await cookies());
  target.delete(SESSION_COOKIE);
  target.delete(REFRESH_COOKIE);
  target.delete(EXPIRES_COOKIE);
  target.delete(USER_COOKIE);
  target.delete(MFA_PENDING_COOKIE);
}

export async function storeMfaPendingToken(mfaToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(MFA_PENDING_COOKIE, mfaToken, {
    ...defaultCookieOptions,
    maxAge: 5 * 60, // 5 minutes — matches backend MFA_PENDING_EXPIRES
  });
}

export async function getMfaPendingToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(MFA_PENDING_COOKIE)?.value ?? null;
}

export async function clearMfaPendingToken() {
  const cookieStore = await cookies();
  cookieStore.delete(MFA_PENDING_COOKIE);
}

export async function verifyMfaAndCreateSession(
  totpCode: string,
  ipAddress?: string,
): Promise<PortalSessionUser> {
  const mfaToken = await getMfaPendingToken();
  if (!mfaToken) {
    throw new Error("MFA session expired. Please log in again.");
  }

  const tokens = await backendJson<BackendTokenPair>("/iam/mfa/verify", {
    method: "POST",
    body: JSON.stringify({ mfaToken, totpCode }),
  });

  const user = await fetchOwnProfile(tokens.accessToken);
  const cookieStore = await cookies();
  await persistSession(cookieStore, tokens, user);
  cookieStore.delete(MFA_PENDING_COOKIE);

  return user;
}

export async function verifyMfaBackupAndCreateSession(
  backupCode: string,
): Promise<PortalSessionUser> {
  const mfaToken = await getMfaPendingToken();
  if (!mfaToken) {
    throw new Error("MFA session expired. Please log in again.");
  }

  const tokens = await backendJson<BackendTokenPair>("/iam/mfa/verify-backup", {
    method: "POST",
    body: JSON.stringify({ mfaToken, backupCode }),
  });

  const user = await fetchOwnProfile(tokens.accessToken);
  const cookieStore = await cookies();
  await persistSession(cookieStore, tokens, user);
  cookieStore.delete(MFA_PENDING_COOKIE);

  return user;
}

export async function loginAndCreateSession(
  username: string,
  password: string,
): Promise<LoginOutcome> {
  const result = await backendJson<BackendLoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  if (result.mfaRequired) {
    await storeMfaPendingToken(result.mfaToken);
    return { status: "mfa_required" };
  }

  const user = await fetchOwnProfile(result.accessToken);
  const cookieStore = await cookies();
  await persistSession(cookieStore, result, user);
  // Clear any stale MFA pending cookie from a previous login attempt
  cookieStore.delete(MFA_PENDING_COOKIE);

  return { status: "ok", user };
}

export async function refreshSessionIfNeeded() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SESSION_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const expiresAt = Number(cookieStore.get(EXPIRES_COOKIE)?.value ?? "0");
  const user = parsePortalUser(cookieStore.get(USER_COOKIE)?.value);

  const hasValidAccessToken =
    accessToken && expiresAt && Date.now() < expiresAt - 30_000;

  if (hasValidAccessToken && user) {
    return { accessToken, user };
  }

  if (!refreshToken) {
    await clearSessionCookies(cookieStore);
    return null;
  }

  try {
    const tokens = await backendJson<BackendTokenPair>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
    const refreshedUser = await fetchOwnProfile(tokens.accessToken);
    await persistSession(cookieStore, tokens, refreshedUser);
    return { accessToken: tokens.accessToken, user: refreshedUser };
  } catch {
    await clearSessionCookies(cookieStore);
    return null;
  }
}

export async function getSession() {
  return refreshSessionIfNeeded();
}

export async function getSessionAccessToken() {
  const session = await getSession();
  return session?.accessToken ?? null;
}

export async function getSessionUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function logoutAndClearSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SESSION_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (accessToken && refreshToken) {
    try {
      await backendJson<void>("/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Best-effort logout. Session cookies are still cleared locally.
    }
  }

  await clearSessionCookies(cookieStore);
}
