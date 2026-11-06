import type { AuthUser } from '@/lib/api/types';
import { isAuthPath } from '@/lib/nav';

// Pages a person may open before setup is done: setup itself, their profile
// and the plain information pages.
const open = ['/setup', '/profile', '/about', '/terms', '/privacy'];

const inside = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(base + '/');

/**
 * True when a signed-in person must finish setup before using the app: a
 * guest (no role yet), or a collector or business with an unfinished profile.
 * Admin and staff are set up by 3REco, never sent here.
 */
export function needsSetup(
  user: Pick<AuthUser, 'role' | 'profileComplete'> | null,
  pathname: string
): boolean {
  if (!user || user.role === 'admin' || user.role === 'staff') return false;
  if (isAuthPath(pathname) || open.some((base) => inside(pathname, base))) {
    return false;
  }
  return !user.role || user.role === 'guest' || !user.profileComplete;
}
