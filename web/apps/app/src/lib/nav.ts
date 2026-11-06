import {
  Boxes,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  PackageOpen,
  Receipt,
  Search,
  Send,
  Store,
  ShoppingCart,
  TrendingUp,
  UserCircle,
  UserPlus,
  Users,
  LogIn,
  Tag,
  Inbox,
} from 'lucide-react';
import type { Role } from '@/lib/api/types';

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
export function navFor(role: Role | null): NavGroup[] {
  switch (role) {
    case 'admin':
      return [
        { links: [dashboard, messages, browse] },
        {
          label: 'Workspace',
          links: [
            ...staffWorkspace,
            { label: 'User management', to: '/admin/users', icon: Users },
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
          links: [
            dashboard,
            messages,
            browse,
            { label: 'Your cart', to: '/cart', icon: ShoppingCart },
          ],
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
        { label: 'Sell', to: '/collections', icon: FileText, raised: true },
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
};

/** The page name shown in the top bar and the browser tab. */
export function pageTitleFor(pathname: string): string {
  const [first = '', second = ''] = pathname.split('/').filter(Boolean);

  if (first === 'market' && second === 'incoming') return 'Incoming requests';
  if (first === 'market' && second === 'outgoing') return 'Outgoing requests';
  if (isRequestPath(pathname)) return 'Messages';
  if (first === 'transactions' && second) {
    return second === 'sales' ? 'Sales' : 'Purchases';
  }

  return pageTitles[first] ?? 'Page not found';
}
