import {
  Boxes,
  ClipboardList,
  History,
  Home,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  PackageOpen,
  Receipt,
  Search,
  Send,
  Store,
  TrendingUp,
  UserCircle,
  UserPlus,
  Users,
  LogIn,
  Tag,
  Inbox,
} from 'lucide-react';
import { canOpen, type PageId } from '@/lib/access';
import type { BusinessRole, Role } from '@/lib/api/types';

export type NavLink = {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: 'messages' | 'incoming';
};

export type NavGroup = { label?: string; links: NavLink[] };

const dashboard: NavLink = {
  label: 'Dashboard',
  to: '/',
  icon: LayoutDashboard,
};
const messages: NavLink = {
  label: 'Messages',
  to: '/messages',
  icon: MessageSquare,
  badge: 'messages',
};
const browse: NavLink = {
  label: 'Browse materials',
  to: '/market',
  icon: Search,
};

const setup: NavLink = { label: 'Finish setup', to: '/setup', icon: UserPlus };

const staffWorkspace: NavLink[] = [
  { label: 'Collections', to: '/collections', icon: ClipboardList },
  { label: 'Collectors', to: '/collectors', icon: Users },
  { label: 'All transactions', to: '/transactions', icon: Receipt },
  { label: 'Materials', to: '/materials', icon: Boxes },
];

/** The sidebar for each role (map section 2.1). */
export function navFor(
  role: Role | null,
  businessRole?: BusinessRole | '',
  activeBusinessId?: string
): NavGroup[] {
  const groups = roleNav(role);
  if (role && activeBusinessId && businessRole === 'owner') {
    const workspace = groups.find((group) => group.label === 'Workspace');
    const team: NavLink = { label: 'Team', to: '/team', icon: Users };
    if (workspace) workspace.links = [...workspace.links, team];
    else groups.push({ label: 'Workspace', links: [team] });
  }
  return groups;
}

function roleNav(role: Role | null): NavGroup[] {
  switch (role) {
    case 'admin':
      return [
        { links: [dashboard, messages, browse] },
        {
          label: 'Workspace',
          links: [
            ...staffWorkspace,
            { label: 'User management', to: '/admin/users', icon: Users },
            { label: 'Activity log', to: '/admin/activity', icon: History },
          ],
        },
      ];
    case 'staff':
      return [
        { links: [dashboard, messages, browse] },
        { label: 'Workspace', links: staffWorkspace },
      ];
    case 'business':
      return [
        {
          links: [dashboard, messages, browse],
        },
        {
          label: 'Your trade',
          links: [
            {
              label: 'Incoming requests',
              to: '/market/incoming',
              icon: Inbox,
              badge: 'incoming',
            },
            { label: 'Outgoing requests', to: '/market/outgoing', icon: Send },
          ],
        },
        {
          label: 'Workspace',
          links: [
            { label: 'Stock', to: '/stock', icon: PackageOpen },
            { label: 'Collections', to: '/collections', icon: ClipboardList },
            { label: 'Collectors', to: '/collectors', icon: Users },
            { label: 'Purchases', to: '/transactions/purchases', icon: Tag },
            { label: 'Sales', to: '/transactions/sales', icon: TrendingUp },
          ],
        },
      ];
    case 'collector':
      return [{ links: [dashboard, browse] }];
    case 'guest':
      return [{ links: [setup] }];
    default:
      return [
        {
          links: [
            browse,
            { label: 'Sign in', to: '/sign-in', icon: LogIn },
            { label: 'Create account', to: '/sign-up', icon: UserPlus },
          ],
        },
      ];
  }
}

export type Tab = {
  label: string;
  to: string;
  icon: LucideIcon;
  raised?: boolean;
  badge?: 'messages';
};

/** Phone bottom tabs. A role only sees tabs it can open (map section 2.2). */
export function tabsFor(role: Role | null): Tab[] {
  const home: Tab = { label: 'Home', to: '/', icon: Home };
  const search: Tab = { label: 'Search', to: '/market', icon: Search };
  const inbox: Tab = {
    label: 'Messages',
    to: '/messages',
    icon: MessageSquare,
    badge: 'messages',
  };
  const account: Tab = { label: 'Account', to: '/profile', icon: UserCircle };

  switch (role) {
    case 'admin':
    case 'staff':
      return [
        home,
        search,
        {
          label: 'Collect',
          to: '/collections',
          icon: ClipboardList,
          raised: true,
        },
        inbox,
        account,
      ];
    case 'business':
      return [
        home,
        search,
        { label: 'Sell', to: '/stock', icon: Store, raised: true },
        inbox,
        account,
      ];
    case 'collector':
      return [
        home,
        {
          label: 'My sales',
          to: '/transactions/sales',
          icon: TrendingUp,
          raised: true,
        },
        account,
      ];
    case 'guest':
      return [
        { label: 'Setup', to: '/setup', icon: UserPlus, raised: true },
        account,
      ];
    default:
      return [
        search,
        { label: 'Sign in', to: '/sign-in', icon: UserCircle },
        {
          label: 'Create account',
          to: '/sign-up',
          icon: UserPlus,
          raised: true,
        },
      ];
  }
}

/** Auth pages draw their own full-screen layout, with no sidebar or tabs. */
export const authPaths = [
  '/sign-in',
  '/sign-up',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/setup',
];

export const isAuthPath = (pathname: string) => authPaths.includes(pathname);

// Pages under /market that are not a request chat.
const marketPages = ['', 'incoming', 'outgoing', 'listing', 'store'];

/** True for /market/<requestId>, the chat that sits under the market route. */
export function isRequestPath(pathname: string) {
  const [first, second = ''] = pathname.split('/').filter(Boolean);
  return first === 'market' && !marketPages.includes(second);
}

/** Chat screens run edge to edge, like a messenger. */
export const isChatPath = (pathname: string) =>
  pathname.startsWith('/messages') || isRequestPath(pathname);

const pageTitles: Record<string, string> = {
  '': 'Dashboard',
  about: 'About',
  cart: 'Your cart',
  collections: 'Collections',
  collectors: 'Collectors',
  materials: 'Materials',
  stock: 'Stock',
  market: 'Browse materials',
  messages: 'Messages',
  profile: 'Your profile',
  transactions: 'Transactions',
  admin: 'User management',
  terms: 'Terms',
  privacy: 'Privacy',
  'sign-in': 'Sign in',
  'sign-up': 'Create account',
  'verify-email': 'Verify email',
  'forgot-password': 'Forgot password',
  'reset-password': 'Reset password',
  setup: 'Finish setup',
  team: 'Team',
  'accept-invite': 'Join a team',
};

const guardedPairs: Record<string, PageId> = {
  'market/incoming': 'incoming',
  'market/outgoing': 'outgoing',
  'transactions/purchases': 'purchases',
  'transactions/sales': 'sales',
  'admin/users': 'users',
  'admin/activity': 'activity',
};
const guardedSingles: Record<string, PageId> = {
  '': 'dashboard',
  messages: 'messages',
  materials: 'materials',
  stock: 'stock',
  collectors: 'collectors',
  collections: 'collections',
  transactions: 'transactions',
  cart: 'cart',
  profile: 'profile',
};

/** The guard a path sits behind, if any (the pages `<Guarded>` wraps). */
export function guardedPageFor(pathname: string): PageId | undefined {
  const [first = '', second = ''] = pathname.split('/').filter(Boolean);
  // Trade detail is open to every trading role; the API checks the parties.
  if (
    first === 'transactions' &&
    second &&
    second !== 'sales' &&
    second !== 'purchases'
  )
    return 'dashboard';

  return (
    guardedPairs[`${first}/${second}`] ??
    (Object.hasOwn(guardedSingles, first) ? guardedSingles[first] : undefined)
  );
}

/** The page name shown in the top bar and the browser tab. */
export function pageTitleFor(pathname: string, role?: Role | null): string {
  const [first = '', second = ''] = pathname.split('/').filter(Boolean);

  const page = guardedPageFor(pathname);
  if (page && role !== undefined && !canOpen(role, page))
    return 'Not available';

  if (first === 'admin' && second === 'activity') return 'Activity log';
  if (first === 'market' && second === 'incoming') return 'Incoming requests';
  if (first === 'market' && second === 'outgoing') return 'Outgoing requests';
  if (isRequestPath(pathname)) return 'Messages';
  if (first === 'transactions' && second) {
    return second === 'sales'
      ? 'Sales'
      : second === 'purchases'
        ? 'Purchases'
        : 'Invoice';
  }

  return pageTitles[first] ?? 'Page not found';
}
