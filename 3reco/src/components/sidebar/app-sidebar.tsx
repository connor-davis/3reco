import { LayoutDashboardIcon, PackageIcon, StoreIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '../ui/sidebar';
import { Label } from '../ui/label';
import { Link } from '@tanstack/react-router';
import TypeGuard from '../guards/type';

export default function AppSidebar() {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <Link to="/">
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Dashboard">
                  <LayoutDashboardIcon />
                  <Label>Dashboard</Label>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Link>

            <TypeGuard type={['admin', 'staff', 'business']}>
              <Link to="/market">
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Market">
                    <StoreIcon />
                    <Label>Market</Label>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </Link>
            </TypeGuard>

            <TypeGuard type={['admin', 'staff']}>
              <Link to="/materials">
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Market">
                    <PackageIcon />
                    <Label>Materials</Label>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </Link>
            </TypeGuard>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
