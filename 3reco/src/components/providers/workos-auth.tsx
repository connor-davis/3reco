/**
 * WorkOS auth context for the React app.
 *
 * Tokens are kept in localStorage; the Convex client is kept in sync via
 * `convex.setAuth()` so every query/mutation is automatically authenticated.
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
  type: string;
}

export type SignInResult =
  | { success: true }
  | {
      requiresMfa: true;
      pendingAuthToken: string;
      /** challengeId of the first enrolled factor (use directly with verifyMfa). */
      challengeId: string | null;
      authFactors: AuthFactor[];
    };

export interface TotpEnrollmentResult {
  factorId: string;
  challengeId: string;
  qrCode: string | null;
  secret: string | null;
  uri: string | null;
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
  /**
   * Complete TOTP MFA after a sign-in that returned requiresMfa.
   * @param pendingAuthToken - from the sign-in response
   * @param challengeId      - from the sign-in response (first challenge)
   * @param code             - 6-digit TOTP code from authenticator app
   */
  verifyMfa: (
    pendingAuthToken: string,
    challengeId: string,
    code: string,
  ) => Promise<{ success: true }>;
  enrollTotp: (userId: string) => Promise<TotpEnrollmentResult>;
  verifyTotpEnrollment: (
    pendingAuthToken: string,
    challengeId: string,
    code: string,
  ) => Promise<{ success: true }>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const WorkOSAuthContext = createContext<WorkOSAuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface WorkOSAuthProviderProps {
  convex: ConvexReactClient;
  /** Convex HTTP-actions origin (e.g. https://convex-site.example.com). */
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
  const siteRef = useRef(siteUrl);
  siteRef.current = siteUrl;

  const post = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(`${siteRef.current}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  }, []);

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
                const data = await post('/auth/refresh', { refreshToken: refresh });
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

  // Restore session from localStorage on mount.
  useEffect(() => {
    const token = getAccessToken();
    applyAuth(!!token);
    setIsLoading(false);
  }, [applyAuth]);

  // ── Auth actions ──────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const data = await post('/auth/sign-in', { email, password });
      if (data.requiresMfa) {
        return {
          requiresMfa: true,
          pendingAuthToken: data.pendingAuthToken,
          challengeId: data.challengeId ?? null,
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
      const data = await post('/auth/sign-up', { email, password, firstName, lastName });
      storeTokens(data.accessToken, data.refreshToken);
      applyAuth(true);
      return { success: true };
    },
    [post, applyAuth],
  );

  const signOut = useCallback(async () => {
    clearTokens();
    applyAuth(false);
    post('/auth/sign-out', {}).catch(() => {});
  }, [post, applyAuth]);

  const verifyMfa = useCallback(
    async (pendingAuthToken: string, challengeId: string, code: string) => {
      const data = await post('/auth/mfa/verify', { pendingAuthToken, challengeId, code });
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
    async (pendingAuthToken: string, challengeId: string, code: string) => {
      await post('/auth/mfa/complete/totp', { pendingAuthToken, challengeId, code });
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
    ],
  );

  return (
    <WorkOSAuthContext.Provider value={value}>
      {children}
    </WorkOSAuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkOSAuth(): WorkOSAuthContextValue {
  const ctx = useContext(WorkOSAuthContext);
  if (!ctx)
    throw new Error('useWorkOSAuth must be used inside <WorkOSAuthProvider>');
  return ctx;
}
