import { Link, useRouterState } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { PersonAvatar } from '@/components/visuals';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { isRequestPath, navFor, type NavLink } from '@/lib/nav';
import { useAuth } from '@/lib/auth/use-auth';
import { useBadgeCounts } from './use-badge-counts';
import { cn } from '@/lib/utils';

/** Which link is "current" for a path. Browse and Messages cover several routes. */
function isActive(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/';

  if (to === '/market') {
    const trade =
      /^\/market\/(incoming|outgoing)/.test(pathname) ||
      isRequestPath(pathname);
    return pathname.startsWith('/market') && !trade;
  }

  if (to === '/messages') {
    return pathname.startsWith('/messages') || isRequestPath(pathname);
  }

  if (to === '/transactions') return pathname === '/transactions';

  return pathname === to || pathname.startsWith(`${to}/`);
}

const subtitles = {
  business: 'Business workspace',
  collector: 'Collector account',
  admin: 'Admin workspace',
  staff: 'Staff workspace',
  guest: 'New account',
} as const;

export function AppSidebar() {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const counts = useBadgeCounts();

  function badgeFor(link: NavLink): number {
    return link.badge ? counts[link.badge] : 0;
  }

  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 h-svh w-60 shrink-0 border-r max-lg:hidden"
    >
      <SidebarHeader className="gap-3">
        <Link
          to="/"
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1 text-lg font-semibold',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <BrandLogo className="h-12" />
        </Link>
        {user && (
          <div className="flex items-center gap-2 px-2">
            <PersonAvatar name={user.name} />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {role ? subtitles[role] : 'Account'}
              </p>
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {navFor(role, user?.business_role, user?.active_business_id).map(
          (group, index) => (
            <SidebarGroup key={group.label ?? index}>
              {group.label && (
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              )}
              <SidebarMenu>
                {group.links.map((link) => (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton
                      isActive={isActive(link.to, pathname)}
                      render={<Link to={link.to} />}
                    >
                      <link.icon />
                      <span>{link.label}</span>
                    </SidebarMenuButton>
                    {badgeFor(link) > 0 && (
                      <SidebarMenuBadge>{badgeFor(link)}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          )
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === '/about'}
              render={<Link to="/about" />}
            >
              <Info />
              <span>About 3REco</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
