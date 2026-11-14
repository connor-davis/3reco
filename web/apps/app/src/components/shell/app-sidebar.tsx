import { Link, useRouterState } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
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
      {/* Same height as the top bar, so the two borders meet in one line. */}
      <SidebarHeader className="h-14 justify-center border-b px-4">
        <Link to="/" aria-label="Home" className="w-fit">
          <BrandLogo className="h-8" />
        </Link>
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
