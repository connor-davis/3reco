import { Link } from '@tanstack/react-router';
import {
  BoxesIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  PackageIcon,
  StoreIcon,
  VanIcon,
} from 'lucide-react';
import TypeGuard from '../guards/type';
import { Label } from '../ui/label';
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

            <TypeGuard type={['business']}>
              <Link to="/stock">
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Stock">
                    <BoxesIcon />
                    <Label>Stock</Label>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </Link>
            </TypeGuard>

            <TypeGuard type={['business']}>
              <Link to="/collections">
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Collections">
                    <VanIcon />
                    <Label>Collections</Label>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </Link>
            </TypeGuard>

            <TypeGuard type={['admin', 'staff']}>
              <Link to="/transactions">
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Transactions">
                    <CreditCardIcon />
                    <Label>Transactions</Label>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </Link>
            </TypeGuard>

            <TypeGuard type={['admin', 'staff']}>
              <Link to="/materials">
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Materials">
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
