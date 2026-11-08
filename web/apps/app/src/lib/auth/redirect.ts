export const guestAuthPages = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

/** A local destination that cannot reopen the guest-only page in a loop. */
export function authDestination(target: string | null): string {
  if (
    !target?.startsWith('/') ||
    target.startsWith('//') ||
    target.includes('\\') ||
    Array.from(target).some((character) => character.charCodeAt(0) < 32)
  ) {
    return '/';
  }

  const url = new URL(target, 'https://3reco.local');
  return url.origin === 'https://3reco.local' &&
    !guestAuthPages.includes(url.pathname)
    ? url.pathname + url.search + url.hash
    : '/';
}
