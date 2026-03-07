/**
 * WorkOS User Management — Convex HTTP actions
 *
 * These actions are the server-side proxy between the custom auth UI and the
 * WorkOS API.  The WorkOS API key never leaves the server.
 *
 * Routes (all registered in http.ts):
 *   POST /auth/sign-in              – email + password
 *   POST /auth/sign-up              – create account
 *   POST /auth/sign-out             – revoke session
 *   POST /auth/refresh              – refresh access token
 *   POST /auth/mfa/challenge        – create an MFA challenge for a factor
 *   POST /auth/mfa/verify           – verify the challenge → final token
 *   POST /auth/mfa/enroll/totp      – begin TOTP enrolment
 *   POST /auth/mfa/complete/totp    – complete TOTP enrolment
 *   POST /auth/mfa/enroll/passkey   – get WebAuthn creation options
 *   POST /auth/mfa/complete/passkey – complete passkey registration
 */

import { httpAction } from './_generated/server';
import { WorkOS } from '@workos-inc/node';

// Initialised lazily so the action only fails at call-time, not module load.
function getWorkOS() {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) throw new Error('WORKOS_API_KEY is not set');
  return new WorkOS(apiKey);
}

function getClientId() {
  const id = process.env.WORKOS_CLIENT_ID;
  if (!id) throw new Error('WORKOS_CLIENT_ID is not set');
  return id;
}

/** Shared CORS headers for all auth responses. */
function corsHeaders() {
  const origin = process.env.SITE_URL ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ─── Sign In ────────────────────────────────────────────────────────────────

export const signIn = httpAction(async (_ctx, request) => {
  const { email, password } = await request.json();
  if (!email || !password) return err('email and password are required');

  const workos = getWorkOS();
  const clientId = getClientId();

  try {
    const result = await workos.userManagement.authenticateWithPassword({
      email,
      password,
      clientId,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return ok({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        workosUserId: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName ?? undefined,
        lastName: result.user.lastName ?? undefined,
      },
    });
  } catch (e: any) {
    // WorkOS signals pending MFA via a specific error code.
    const raw = e?.rawData ?? e?.error ?? {};
    if (raw.pending_authentication_token) {
      return ok({
        requiresMfa: true,
        pendingAuthToken: raw.pending_authentication_token,
        authFactors: raw.authentication_factors ?? [],
      });
    }
    return err(e?.message ?? 'Authentication failed');
  }
});

// ─── Sign Up ────────────────────────────────────────────────────────────────

export const signUp = httpAction(async (_ctx, request) => {
  const { email, password, firstName, lastName } = await request.json();
  if (!email || !password) return err('email and password are required');

  const workos = getWorkOS();
  const clientId = getClientId();

  try {
    // Create the user in WorkOS …
    await workos.userManagement.createUser({ email, password, firstName, lastName });

    // … then immediately authenticate to get tokens.
    const result = await workos.userManagement.authenticateWithPassword({
      email,
      password,
      clientId,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return ok({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        workosUserId: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName ?? undefined,
        lastName: result.user.lastName ?? undefined,
      },
    });
  } catch (e: any) {
    return err(e?.message ?? 'Registration failed');
  }
});

// ─── Sign Out ───────────────────────────────────────────────────────────────

export const signOut = httpAction(async (_ctx, request) => {
  const { sessionId } = await request.json();
  if (!sessionId) return ok({ success: true }); // no-op if no session

  const workos = getWorkOS();
  try {
    await workos.userManagement.revokeSession({ sessionId });
  } catch {
    // Best-effort — still clear client state.
  }
  return ok({ success: true });
});

// ─── Refresh Token ──────────────────────────────────────────────────────────

export const refreshToken = httpAction(async (_ctx, request) => {
  const { refreshToken: token } = await request.json();
  if (!token) return err('refreshToken is required', 401);

  const workos = getWorkOS();
  const clientId = getClientId();

  try {
    const result = await workos.userManagement.authenticateWithRefreshToken({
      refreshToken: token,
      clientId,
    });
    return ok({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (e: any) {
    return err(e?.message ?? 'Token refresh failed', 401);
  }
});

// ─── MFA: Challenge ─────────────────────────────────────────────────────────

/**
 * Given a `pendingAuthToken` and a `factorId`, create an MFA challenge.
 * For WebAuthn factors the response also includes `publicKeyOptions`.
 */
export const mfaChallenge = httpAction(async (_ctx, request) => {
  const { factorId } = await request.json();
  if (!factorId) return err('factorId is required');

  const workos = getWorkOS();

  try {
    const challenge = await workos.userManagement.challengeAuthFactor({
      authenticationFactorId: factorId,
    });
    return ok({
      challengeId: challenge.id,
      // WebAuthn factors carry a publicKeyCredentialRequestOptions payload.
      ...(challenge.type === 'webauthn' && {
        publicKeyOptions: (challenge as any).authenticationChallenge,
      }),
    });
  } catch (e: any) {
    return err(e?.message ?? 'Could not create MFA challenge');
  }
});

// ─── MFA: Verify ────────────────────────────────────────────────────────────

export const mfaVerify = httpAction(async (_ctx, request) => {
  const { pendingAuthToken, challengeId, code, credential } =
    await request.json();
  if (!pendingAuthToken || !challengeId)
    return err('pendingAuthToken and challengeId are required');

  const workos = getWorkOS();

  try {
    const result = await workos.userManagement.verifyAuthChallenge({
      pendingAuthenticationToken: pendingAuthToken,
      authenticationChallengeId: challengeId,
      // TOTP uses `code`; WebAuthn sends the credential response.
      code: code ?? credential,
    });
    return ok({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        workosUserId: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName ?? undefined,
        lastName: result.user.lastName ?? undefined,
      },
    });
  } catch (e: any) {
    return err(e?.message ?? 'MFA verification failed');
  }
});

// ─── TOTP Enrolment: Begin ──────────────────────────────────────────────────

export const totpEnrollBegin = httpAction(async (_ctx, request) => {
  const { userId } = await request.json();
  if (!userId) return err('userId is required');

  const workos = getWorkOS();

  try {
    const result = await workos.userManagement.enrollAuthFactor({
      userId,
      type: 'totp',
      totpIssuer: process.env.APP_NAME ?? '3reco',
      totpUser: userId,
    });
    return ok({
      enrollmentToken: (result.authenticationChallenge as any)?.id ?? null,
      challengeId: result.authenticationChallenge?.id ?? null,
      factorId: result.authenticationFactor.id,
      // QR code URI + plain secret for manual entry
      qrCode: (result as any).totp?.qrCode ?? null,
      secret: (result as any).totp?.secret ?? null,
      uri: (result as any).totp?.uri ?? null,
    });
  } catch (e: any) {
    return err(e?.message ?? 'TOTP enrolment failed');
  }
});

// ─── TOTP Enrolment: Complete ────────────────────────────────────────────────

export const totpEnrollComplete = httpAction(async (_ctx, request) => {
  const { challengeId, code } = await request.json();
  if (!challengeId || !code) return err('challengeId and code are required');

  const workos = getWorkOS();

  try {
    await workos.userManagement.verifyAuthChallenge({
      pendingAuthenticationToken: undefined as any, // not needed for enrolment
      authenticationChallengeId: challengeId,
      code,
    });
    return ok({ success: true });
  } catch (e: any) {
    return err(e?.message ?? 'TOTP enrolment verification failed');
  }
});

// ─── Passkey Enrolment: Begin ────────────────────────────────────────────────

/**
 * Returns WebAuthn `PublicKeyCredentialCreationOptions` so the browser can
 * call `navigator.credentials.create()`.
 */
export const passkeyEnrollBegin = httpAction(async (_ctx, request) => {
  const { userId } = await request.json();
  if (!userId) return err('userId is required');

  const workos = getWorkOS();

  try {
    const result = await workos.userManagement.enrollAuthFactor({
      userId,
      type: 'webauthn',
    });
    return ok({
      factorId: result.authenticationFactor.id,
      challengeId: result.authenticationChallenge?.id ?? null,
      publicKeyOptions: (result as any).webAuthn ?? (result as any).webauthn ?? null,
    });
  } catch (e: any) {
    return err(e?.message ?? 'Passkey enrolment initiation failed');
  }
});

// ─── Passkey Enrolment: Complete ────────────────────────────────────────────

export const passkeyEnrollComplete = httpAction(async (_ctx, request) => {
  const { challengeId, credential } = await request.json();
  if (!challengeId || !credential)
    return err('challengeId and credential are required');

  const workos = getWorkOS();

  try {
    await workos.userManagement.verifyAuthChallenge({
      pendingAuthenticationToken: undefined as any,
      authenticationChallengeId: challengeId,
      code: credential,
    });
    return ok({ success: true });
  } catch (e: any) {
    return err(e?.message ?? 'Passkey enrolment verification failed');
  }
});
