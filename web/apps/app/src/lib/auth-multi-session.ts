export type BetterAuthSession = {
  id: string;
  token: string;
  userId: string;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type BetterAuthSessionResult =
  | BetterAuthSession[]
  | { data?: BetterAuthSession[] | null }
  | null
  | undefined;

export type BetterAuthDeviceSession = {
  session: BetterAuthSession;
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
};

export type BetterAuthDeviceSessionResult =
  | BetterAuthDeviceSession[]
  | { data?: BetterAuthDeviceSession[] | null }
  | null
  | undefined;

export function normalizeBetterAuthSessions(result: BetterAuthSessionResult) {
  if (Array.isArray(result)) {
    return result;
  }

  return result?.data ?? [];
}

export function normalizeBetterAuthDeviceSessions(
  result: BetterAuthDeviceSessionResult
) {
  if (Array.isArray(result)) {
    return result;
  }

  return result?.data ?? [];
}

export function formatSessionExpiry(expiresAt: BetterAuthSession['expiresAt']) {
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown expiry';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatSessionDevice(session: BetterAuthSession) {
  const agent = session.userAgent?.trim();

  if (!agent) {
    return 'Browser session';
  }

  if (/iphone|ipad|android|mobile/i.test(agent)) {
    return 'Mobile browser';
  }

  if (/windows|macintosh|linux|x11/i.test(agent)) {
    return 'Desktop browser';
  }

  return 'Browser session';
}

export function getSessionAccountLabel(entry: BetterAuthDeviceSession) {
  return entry.user.name || entry.user.email || formatSessionDevice(entry.session);
}

export async function revokeBrowserAccounts(
  sessions: BetterAuthDeviceSession[],
  currentSessionId: string | null | undefined,
  revokeSession: (sessionToken: string) => Promise<unknown>
) {
  const orderedSessions = [...sessions].sort((left, right) => {
    const leftIsCurrent = left.session.id === currentSessionId;
    const rightIsCurrent = right.session.id === currentSessionId;

    return Number(leftIsCurrent) - Number(rightIsCurrent);
  });

  for (const session of orderedSessions) {
    await revokeSession(session.session.token);
  }
}
