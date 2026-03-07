/// <reference types="node" />
/**
 * WorkOS User Management — Convex HTTP actions
 *
 * Calls the WorkOS REST API directly (no SDK) so there is no Node.js-only
 * dependency in the Convex runtime.
 *
 * Routes (registered in http.ts):
 *   POST /auth/sign-in              – email + password
 *   POST /auth/sign-up              – email + password registration
 *   POST /auth/phone/sign-in        – phone + password
 *   POST /auth/phone/sign-up        – phone + password registration
 *   POST /auth/sign-out             – revoke session (best-effort)
 *   POST /auth/refresh              – refresh access token
 *   POST /auth/mfa/verify           – complete TOTP MFA after sign-in
 *   POST /auth/mfa/enroll/totp      – begin TOTP factor enrolment
 *   POST /auth/mfa/complete/totp    – verify TOTP code to finish enrolment
 *
 * Phone auth uses a stable synthetic email (phone.{digits}@phone.3reco.app)
 * backed by a normal WorkOS email+password account so all token flows are
 * identical.  No SMS / OTP verification is performed — users provide a
 * password exactly as with email sign-up.
 */

import { httpAction } from './_generated/server';

const WORKOS_API = 'https://api.workos.com';

// ─── Config helpers ──────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.WORKOS_API_KEY;
  if (!key) throw new Error('WORKOS_API_KEY is not set');
  return key;
}

function getClientId(): string {
  const id = process.env.WORKOS_CLIENT_ID;
  if (!id) throw new Error('WORKOS_CLIENT_ID is not set');
  return id;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

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

/**
 * POST to the WorkOS REST API.
 * Throws an error with `rawData` set to the parsed JSON body on non-2xx.
 */
async function workosPost(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<Record<string, any>> {
  const res = await fetch(`${WORKOS_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, any>;
  if (!res.ok) {
    const e = Object.assign(
      new Error(data.message ?? `WorkOS error ${res.status}`),
      { rawData: data, status: res.status },
    );
    throw e;
  }
  return data;
}

// ─── Domain helpers ──────────────────────────────────────────────────────────

/** Extract the fields we forward to the frontend from a WorkOS user object. */
function mapUser(user: Record<string, any>) {
  return {
    workosUserId: user.id as string,
    email: (user.email ?? '') as string,
    firstName: (user.first_name ?? undefined) as string | undefined,
    lastName: (user.last_name ?? undefined) as string | undefined,
  };
}

/**
 * Normalise a phone number to E.164 format.
 * Handles South-African local numbers starting with 0.
 * Defaults to +27 (South Africa) but respects the APP_COUNTRY_CODE env var.
 */
function normalizePhone(phone: string): string {
  // Strip everything except digits and a leading +
  const stripped = phone.replace(/[^\d]/g, '');
  if (!stripped) return phone; // return as-is if nothing usable
  // Local number starting with 0: replace with country prefix
  if (stripped.startsWith('0')) {
    const countryCode = (process.env.APP_COUNTRY_CODE ?? '27').replace(/^\+/, '');
    return '+' + countryCode + stripped.slice(1);
  }
  // Already includes country code (no leading 0)
  return '+' + stripped;
}

/**
 * Derive a stable synthetic email for phone-only accounts so WorkOS can
 * store them as ordinary email+password users.
 * "+27821234567" → "phone.27821234567@phone.3reco.app"
 */
function phoneToEmail(phone: string): string {
  const digits = normalizePhone(phone).replace(/^\+/, '');
  return `phone.${digits}@phone.3reco.app`;
}

/** Detect a pending-MFA error response from WorkOS and return an ok() payload. */
function tryHandleMfaError(e: any) {
  const raw = (e?.rawData ?? {}) as Record<string, any>;
  if (!raw.pending_authentication_token) return null;
  const challenge = (raw.authentication_challenges as any[])?.[0];
  return ok({
    requiresMfa: true,
    pendingAuthToken: raw.pending_authentication_token as string,
    challengeId: challenge?.id ?? null,
    authFactors: ((raw.authentication_challenges ?? []) as any[]).map(
      (c: any) => ({ id: c.id, type: (c.type as string) ?? 'totp' }),
    ),
  });
}

// ─── Sign In — email + password ──────────────────────────────────────────────

export const signIn = httpAction(async (_ctx, request) => {
  const { email, password } = await request.json();
  if (!email || !password) return err('email and password are required');

  const apiKey = getApiKey();
  const clientId = getClientId();

  try {
    const data = await workosPost(
      '/user_management/authenticate',
      {
        grant_type: 'password',
        client_id: clientId,
        email,
        password,
        ip_address: request.headers.get('x-forwarded-for') ?? undefined,
        user_agent: request.headers.get('user-agent') ?? undefined,
      },
      apiKey,
    );

    return ok({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: mapUser(data.user),
    });
  } catch (e: any) {
    return tryHandleMfaError(e) ?? err(e?.message ?? 'Authentication failed');
  }
});

// ─── Sign Up — email + password ──────────────────────────────────────────────

export const signUp = httpAction(async (_ctx, request) => {
  const { email, password, firstName, lastName } = await request.json();
  if (!email || !password) return err('email and password are required');

  const apiKey = getApiKey();
  const clientId = getClientId();

  try {
    await workosPost(
      '/user_management/users',
      {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        email_verified: true,
      },
      apiKey,
    );

    const data = await workosPost(
      '/user_management/authenticate',
      {
        grant_type: 'password',
        client_id: clientId,
        email,
        password,
        ip_address: request.headers.get('x-forwarded-for') ?? undefined,
        user_agent: request.headers.get('user-agent') ?? undefined,
      },
      apiKey,
    );

    return ok({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: mapUser(data.user),
    });
  } catch (e: any) {
    return err(e?.message ?? 'Registration failed');
  }
});

// ─── Phone Sign In ───────────────────────────────────────────────────────────

export const phoneSignIn = httpAction(async (_ctx, request) => {
  const { phone, password } = await request.json();
  if (!phone || !password) return err('phone and password are required');

  const apiKey = getApiKey();
  const clientId = getClientId();
  const normalizedPhone = normalizePhone(phone);
  const email = phoneToEmail(phone);

  try {
    const data = await workosPost(
      '/user_management/authenticate',
      {
        grant_type: 'password',
        client_id: clientId,
        email,
        password,
        ip_address: request.headers.get('x-forwarded-for') ?? undefined,
        user_agent: request.headers.get('user-agent') ?? undefined,
      },
      apiKey,
    );

    return ok({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: { ...mapUser(data.user), phone: normalizedPhone },
    });
  } catch (e: any) {
    return (
      tryHandleMfaError(e) ??
      err(e?.message ?? 'Authentication failed')
    );
  }
});

// ─── Phone Sign Up ───────────────────────────────────────────────────────────

export const phoneSignUp = httpAction(async (_ctx, request) => {
  const { phone, password, firstName, lastName } = await request.json();
  if (!phone || !password) return err('phone and password are required');

  const apiKey = getApiKey();
  const clientId = getClientId();
  const normalizedPhone = normalizePhone(phone);
  const email = phoneToEmail(phone);

  try {
    await workosPost(
      '/user_management/users',
      {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        email_verified: true,
      },
      apiKey,
    );

    const data = await workosPost(
      '/user_management/authenticate',
      {
        grant_type: 'password',
        client_id: clientId,
        email,
        password,
        ip_address: request.headers.get('x-forwarded-for') ?? undefined,
        user_agent: request.headers.get('user-agent') ?? undefined,
      },
      apiKey,
    );

    return ok({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: { ...mapUser(data.user), phone: normalizedPhone },
    });
  } catch (e: any) {
    return err(e?.message ?? 'Registration failed');
  }
});

// ─── Sign Out ────────────────────────────────────────────────────────────────

export const signOut = httpAction(async (_ctx, request) => {
  const body = await request.json().catch(() => ({}));
  const { sessionId } = body as { sessionId?: string };

  if (sessionId) {
    const apiKey = getApiKey();
    try {
      await workosPost(
        '/user_management/sessions/revoke',
        { session_id: sessionId },
        apiKey,
      );
    } catch {
      // Best-effort — client clears tokens regardless.
    }
  }
  return ok({ success: true });
});

// ─── Refresh Token ───────────────────────────────────────────────────────────

export const refreshToken = httpAction(async (_ctx, request) => {
  const { refreshToken: token } = await request.json();
  if (!token) return err('refreshToken is required', 401);

  const apiKey = getApiKey();
  const clientId = getClientId();

  try {
    const data = await workosPost(
      '/user_management/authenticate',
      {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: token,
      },
      apiKey,
    );

    return ok({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });
  } catch (e: any) {
    return err(e?.message ?? 'Token refresh failed', 401);
  }
});

// ─── MFA: Verify (after sign-in) ─────────────────────────────────────────────

export const mfaVerify = httpAction(async (_ctx, request) => {
  const { pendingAuthToken, challengeId, code } = await request.json();
  if (!pendingAuthToken || !challengeId || !code)
    return err('pendingAuthToken, challengeId and code are required');

  const apiKey = getApiKey();
  const clientId = getClientId();

  try {
    const data = await workosPost(
      '/user_management/authenticate',
      {
        grant_type: 'urn:workos:oauth:grant-type:mfa-totp',
        client_id: clientId,
        pending_authentication_token: pendingAuthToken,
        authentication_challenge_id: challengeId,
        code,
      },
      apiKey,
    );

    return ok({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: mapUser(data.user),
    });
  } catch (e: any) {
    return err(e?.message ?? 'MFA verification failed');
  }
});

// ─── TOTP Enrolment: Begin ───────────────────────────────────────────────────

export const totpEnrollBegin = httpAction(async (_ctx, request) => {
  const { userId } = await request.json();
  if (!userId) return err('userId is required');

  const apiKey = getApiKey();

  try {
    const data = await workosPost(
      `/user_management/users/${userId}/auth_factors`,
      {
        type: 'totp',
        totp_issuer: process.env.APP_NAME ?? '3reco',
        totp_user: userId,
      },
      apiKey,
    );

    const factor = data.authentication_factor as Record<string, any>;
    const challenge = data.authentication_challenge as Record<string, any>;

    return ok({
      factorId: factor.id,
      challengeId: challenge.id,
      qrCode: factor.totp?.qr_code ?? null,
      secret: factor.totp?.secret ?? null,
      uri: factor.totp?.uri ?? null,
    });
  } catch (e: any) {
    return err(e?.message ?? 'TOTP enrolment failed');
  }
});

// ─── TOTP Enrolment: Complete ────────────────────────────────────────────────

export const totpEnrollComplete = httpAction(async (_ctx, request) => {
  const { pendingAuthToken, challengeId, code } = await request.json();
  if (!challengeId || !code) return err('challengeId and code are required');

  const apiKey = getApiKey();
  const clientId = getClientId();

  try {
    await workosPost(
      '/user_management/authenticate',
      {
        grant_type: 'urn:workos:oauth:grant-type:mfa-totp',
        client_id: clientId,
        pending_authentication_token: pendingAuthToken ?? '',
        authentication_challenge_id: challengeId,
        code,
      },
      apiKey,
    );

    return ok({ success: true });
  } catch (e: any) {
    return err(e?.message ?? 'TOTP enrolment verification failed');
  }
});
