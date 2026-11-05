export type AuthFlowPath =
  | '/'
  | '/auth/forgot-password'
  | '/auth/reset-password'
  | '/auth/sign-in'
  | '/auth/sign-up'
  | '/auth/verify-email'
  | '/profile';

export function sanitizeReturnTo(value: unknown, fallback = '/') {
  return typeof value === 'string' && value.startsWith('/') ? value : fallback;
}

export function buildAuthPath(
  pathname: AuthFlowPath,
  params: Record<string, string | undefined> = {}
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}
