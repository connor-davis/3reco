import { Link } from '@tanstack/react-router';
import {
  BoxesIcon,
  ChevronRightIcon,
  CreditCardIcon,
  EyeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  PackageIcon,
  SendIcon,
  StoreIcon,
  UsersIcon,
  VanIcon,
} from 'lucide-react';
import TypeGuard from '../guards/type';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { Label } from '../ui/label';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
              <Collapsible defaultOpen className="group/market">
                <SidebarMenuItem>
                  <CollapsibleTrigger
                    render={
                      <SidebarMenuButton tooltip="Market">
                        <StoreIcon />
                        <Label>Market</Label>
                        <ChevronRightIcon className="ml-auto transition-transform group-data-[state=open]/market:rotate-90" />
                      </SidebarMenuButton>
                    }
                  />

                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <Link to="/market">
                          <SidebarMenuSubButton>
                            <EyeIcon className="size-3.5" />
                            <Label>Browse</Label>
                          </SidebarMenuSubButton>
                        </Link>
                      </SidebarMenuSubItem>
                      <TypeGuard type={['business']}>
                        <SidebarMenuSubItem>
                          <Link to="/market/incoming">
                            <SidebarMenuSubButton>
                              <InboxIcon className="size-3.5" />
                              <Label>Incoming</Label>
                            </SidebarMenuSubButton>
                          </Link>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <Link to="/market/outgoing">
                            <SidebarMenuSubButton>
                              <SendIcon className="size-3.5" />
                              <Label>Outgoing</Label>
                            </SidebarMenuSubButton>
                          </Link>
                        </SidebarMenuSubItem>
                      </TypeGuard>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
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

            <TypeGuard type={['business']}>
              <Collapsible defaultOpen className="group/transactions">
                <SidebarMenuItem>
                  <CollapsibleTrigger
                    render={
                      <SidebarMenuButton tooltip="Transactions">
                        <CreditCardIcon />
                        <Label>Transactions</Label>
                        <ChevronRightIcon className="ml-auto transition-transform group-data-[state=open]/transactions:rotate-90" />
                      </SidebarMenuButton>
                    }
                  />

                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <Link to="/transactions/purchases">
                          <SidebarMenuSubButton>
                            <VanIcon className="size-3.5" />
                            <Label>Purchases</Label>
                          </SidebarMenuSubButton>
                        </Link>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <Link to="/transactions/sales">
                          <SidebarMenuSubButton>
                            <PackageIcon className="size-3.5" />
                            <Label>Sales</Label>
                          </SidebarMenuSubButton>
                        </Link>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
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

      <SidebarFooter>
        <SidebarMenu>
          <TypeGuard type="admin">
            <Link to="/admin/users">
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="User Management">
                  <UsersIcon />
                  <Label>Users</Label>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Link>
          </TypeGuard>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
