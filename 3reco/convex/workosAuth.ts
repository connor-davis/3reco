/// <reference types="node" />
/**
 * WorkOS User Management — Convex HTTP actions
 *
 * Server-side proxy between the custom auth UI and the WorkOS API.
 * The WorkOS API key never leaves the server.
 *
 * Routes (registered in http.ts):
 *   POST /auth/sign-in           – email + password (returns tokens or MFA challenge)
 *   POST /auth/sign-up           – create account + authenticate
 *   POST /auth/sign-out          – revoke session (best-effort)
 *   POST /auth/refresh           – refresh access token
 *   POST /auth/mfa/verify        – complete TOTP MFA after sign-in
 *   POST /auth/mfa/enroll/totp   – begin TOTP factor enrolment
 *   POST /auth/mfa/complete/totp – verify TOTP code to complete enrolment
 *
 * WorkOS MFA sign-in flow:
 *   1. POST /auth/sign-in  → { requiresMfa: true, pendingAuthToken, challengeId }
 *   2. User enters TOTP code
 *   3. POST /auth/mfa/verify { pendingAuthToken, challengeId, code } → { accessToken, refreshToken }
 *
 * WorkOS TOTP enrolment flow:
 *   1. POST /auth/mfa/enroll/totp  → { factorId, challengeId, qrCode, secret, uri }
 *   2. User scans QR code and enters code
 *   3. POST /auth/mfa/complete/totp { pendingAuthToken, challengeId, code } → { success }
 */

import { httpAction } from './_generated/server';
import { WorkOS } from '@workos-inc/node';

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
    // WorkOS signals pending MFA via a specific error body.
    const raw = e?.rawData ?? {};
    if (raw.pending_authentication_token) {
      // The first challenge is automatically created for the user's enrolled factor.
      const challenge = raw.authentication_challenges?.[0];
      return ok({
        requiresMfa: true,
        pendingAuthToken: raw.pending_authentication_token as string,
        challengeId: challenge?.id ?? null,
        // The WorkOS User Management API currently only supports TOTP as an
        // MFA method in the Node SDK (passkeys are hosted-UI only), so all
        // challenges are TOTP-based.
        authFactors: (raw.authentication_challenges ?? []).map((c: any) => ({
          id: c.id,
          type: (c.type as string) ?? 'totp',
        })),
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
    await workos.userManagement.createUser({ email, password, firstName, lastName });

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
  const body = await request.json().catch(() => ({}));
  const { sessionId } = body as { sessionId?: string };

  if (sessionId) {
    const workos = getWorkOS();
    try {
      await workos.userManagement.revokeSession({ sessionId });
    } catch {
      // Best-effort — client clears tokens regardless.
    }
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

// ─── MFA: Verify (after sign-in) ─────────────────────────────────────────────

/**
 * Complete TOTP verification after a password sign-in that returned requiresMfa.
 * pendingAuthToken + challengeId come from the sign-in response.
 * code is the 6-digit TOTP code from the user's authenticator app.
 */
export const mfaVerify = httpAction(async (_ctx, request) => {
  const { pendingAuthToken, challengeId, code } = await request.json();
  if (!pendingAuthToken || !challengeId || !code)
    return err('pendingAuthToken, challengeId and code are required');

  const workos = getWorkOS();
  const clientId = getClientId();

  try {
    const result = await workos.userManagement.authenticateWithTotp({
      clientId,
      pendingAuthenticationToken: pendingAuthToken,
      authenticationChallengeId: challengeId,
      code,
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

    const factor = result.authenticationFactor;
    const challenge = result.authenticationChallenge;

    return ok({
      factorId: factor.id,
      challengeId: challenge.id,
      // TotpWithSecrets fields are on factor.totp
      qrCode: factor.totp?.qrCode ?? null,
      secret: factor.totp?.secret ?? null,
      uri: factor.totp?.uri ?? null,
    });
  } catch (e: any) {
    return err(e?.message ?? 'TOTP enrolment failed');
  }
});

// ─── TOTP Enrolment: Complete ────────────────────────────────────────────────

/**
 * Verify the TOTP code to confirm enrolment.
 * Uses authenticateWithTotp with the challenge from the enrolment response.
 * pendingAuthToken here is the enrollment challenge token (may be empty for
 * some WorkOS configurations — the call succeeds if the code is valid).
 */
export const totpEnrollComplete = httpAction(async (_ctx, request) => {
  const { pendingAuthToken, challengeId, code } = await request.json();
  if (!challengeId || !code) return err('challengeId and code are required');

  const workos = getWorkOS();
  const clientId = getClientId();

  try {
    await workos.userManagement.authenticateWithTotp({
      clientId,
      pendingAuthenticationToken: pendingAuthToken ?? '',
      authenticationChallengeId: challengeId,
      code,
    });
    return ok({ success: true });
  } catch (e: any) {
    return err(e?.message ?? 'TOTP enrolment verification failed');
  }
});
