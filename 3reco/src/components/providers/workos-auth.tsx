/**
 * WorkOS auth context for the React app.
 *
 * Responsibilities:
 *  - Calls the Convex HTTP actions that proxy WorkOS User Management.
 *  - Stores the access / refresh tokens in localStorage.
 *  - Keeps `ConvexReactClient.setAuth()` up-to-date so every Convex
 *    query/mutation is automatically authenticated.
 *  - Exposes `signIn`, `signUp`, `signOut`, `verifyMfa`, `enrollTotp`,
 *    `verifyTotpEnrollment`, `enrollPasskey`, `verifyPasskeyEnrollment`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ConvexReactClient } from 'convex/react';

// ─── Token storage ───────────────────────────────────────────────────────────

const ACCESS_KEY = 'workos_access_token';
const REFRESH_KEY = 'workos_refresh_token';

function storeTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthFactor {
  id: string;
  type: 'totp' | 'webauthn' | string;
}

export type SignInResult =
  | { success: true }
  | { requiresMfa: true; pendingAuthToken: string; authFactors: AuthFactor[] };

export interface TotpEnrollmentResult {
  factorId: string;
  challengeId: string;
  qrCode: string | null;
  secret: string | null;
  uri: string | null;
}

export interface PasskeyEnrollmentResult {
  factorId: string;
  challengeId: string;
  /** WebAuthn `PublicKeyCredentialCreationOptions` (JSON-serialisable form). */
  publicKeyOptions: Record<string, unknown> | null;
}

interface WorkOSAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  verifyMfa: (
    pendingAuthToken: string,
    factorId: string,
    code: string,
    credential?: unknown,
  ) => Promise<{ success: true }>;
  enrollTotp: (userId: string) => Promise<TotpEnrollmentResult>;
  verifyTotpEnrollment: (
    challengeId: string,
    code: string,
  ) => Promise<{ success: true }>;
  enrollPasskey: (userId: string) => Promise<PasskeyEnrollmentResult>;
  verifyPasskeyEnrollment: (
    challengeId: string,
    credential: unknown,
  ) => Promise<{ success: true }>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const WorkOSAuthContext = createContext<WorkOSAuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface WorkOSAuthProviderProps {
  convex: ConvexReactClient;
  /** URL of the Convex HTTP-actions site (e.g. https://convex-site.example.com). */
  siteUrl: string;
  children: ReactNode;
}

export function WorkOSAuthProvider({
  convex,
  siteUrl,
  children,
}: WorkOSAuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Keep siteUrl stable in callbacks via ref.
  const siteRef = useRef(siteUrl);
  siteRef.current = siteUrl;

  /** POST to a Convex HTTP action. */
  const post = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(`${siteRef.current}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      return json;
    },
    [],
  );

  /** Attach (or clear) the token on the Convex client. */
  const applyAuth = useCallback(
    (authenticated: boolean) => {
      if (authenticated) {
        convex.setAuth(
          async ({ forceRefreshToken }) => {
            const current = getAccessToken();
            if (!current || forceRefreshToken) {
              const refresh = getRefreshToken();
              if (!refresh) {
                clearTokens();
                setIsAuthenticated(false);
                return null;
              }
              try {
                const data = await post('/auth/refresh', {
                  refreshToken: refresh,
                });
                storeTokens(data.accessToken, data.refreshToken);
                return data.accessToken as string;
              } catch {
                clearTokens();
                setIsAuthenticated(false);
                return null;
              }
            }
            return current;
          },
          () => {
            clearTokens();
            setIsAuthenticated(false);
          },
        );
        setIsAuthenticated(true);
      } else {
        convex.clearAuth();
        setIsAuthenticated(false);
      }
    },
    [convex, post],
  );

  // On mount, restore an existing session from localStorage.
  useEffect(() => {
    const token = getAccessToken();
    applyAuth(!!token);
    setIsLoading(false);
  }, [applyAuth]);

  // ── Auth actions ────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const data = await post('/auth/sign-in', { email, password });
      if (data.requiresMfa) {
        return {
          requiresMfa: true,
          pendingAuthToken: data.pendingAuthToken,
          authFactors: data.authFactors ?? [],
        };
      }
      storeTokens(data.accessToken, data.refreshToken);
      applyAuth(true);
      return { success: true };
    },
    [post, applyAuth],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      firstName?: string,
      lastName?: string,
    ): Promise<SignInResult> => {
      const data = await post('/auth/sign-up', {
        email,
        password,
        firstName,
        lastName,
      });
      storeTokens(data.accessToken, data.refreshToken);
      applyAuth(true);
      return { success: true };
    },
    [post, applyAuth],
  );

  const signOut = useCallback(async () => {
    const refresh = getRefreshToken();
    clearTokens();
    applyAuth(false);
    // Best-effort server-side revocation (no sessionId available client-side).
    if (refresh) post('/auth/sign-out', {}).catch(() => {});
  }, [post, applyAuth]);

  const verifyMfa = useCallback(
    async (
      pendingAuthToken: string,
      factorId: string,
      code: string,
      credential?: unknown,
    ) => {
      // First create the challenge for the chosen factor.
      const { challengeId } = await post('/auth/mfa/challenge', { factorId });
      // Then verify it.
      const data = await post('/auth/mfa/verify', {
        pendingAuthToken,
        challengeId,
        code,
        credential,
      });
      storeTokens(data.accessToken, data.refreshToken);
      applyAuth(true);
      return { success: true as const };
    },
    [post, applyAuth],
  );

  const enrollTotp = useCallback(
    async (userId: string): Promise<TotpEnrollmentResult> => {
      const data = await post('/auth/mfa/enroll/totp', { userId });
      return {
        factorId: data.factorId,
        challengeId: data.challengeId,
        qrCode: data.qrCode ?? null,
        secret: data.secret ?? null,
        uri: data.uri ?? null,
      };
    },
    [post],
  );

  const verifyTotpEnrollment = useCallback(
    async (challengeId: string, code: string) => {
      await post('/auth/mfa/complete/totp', { challengeId, code });
      return { success: true as const };
    },
    [post],
  );

  const enrollPasskey = useCallback(
    async (userId: string): Promise<PasskeyEnrollmentResult> => {
      const data = await post('/auth/mfa/enroll/passkey', { userId });
      return {
        factorId: data.factorId,
        challengeId: data.challengeId,
        publicKeyOptions: data.publicKeyOptions ?? null,
      };
    },
    [post],
  );

  const verifyPasskeyEnrollment = useCallback(
    async (challengeId: string, credential: unknown) => {
      await post('/auth/mfa/complete/passkey', { challengeId, credential });
      return { success: true as const };
    },
    [post],
  );

  const value = useMemo<WorkOSAuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      signIn,
      signUp,
      signOut,
      verifyMfa,
      enrollTotp,
      verifyTotpEnrollment,
      enrollPasskey,
      verifyPasskeyEnrollment,
    }),
    [
      isAuthenticated,
      isLoading,
      signIn,
      signUp,
      signOut,
      verifyMfa,
      enrollTotp,
      verifyTotpEnrollment,
      enrollPasskey,
      verifyPasskeyEnrollment,
    ],
  );

  return (
    <WorkOSAuthContext.Provider value={value}>
      {children}
    </WorkOSAuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWorkOSAuth(): WorkOSAuthContextValue {
  const ctx = useContext(WorkOSAuthContext);
  if (!ctx)
    throw new Error('useWorkOSAuth must be used inside <WorkOSAuthProvider>');
  return ctx;
}
