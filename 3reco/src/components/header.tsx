import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@workos-inc/authkit-react';
import {
  ComputerIcon,
  IdCardIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  SunMoonIcon,
} from 'lucide-react';
import { Activity } from 'react';
import { useTheme } from './providers/theme';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Label } from './ui/label';
import { Link } from '@tanstack/react-router';
import { SidebarTrigger } from './ui/sidebar';
import NotificationTray from './notifications/tray';

export default function Header() {
  const { signOut } = useAuth();
  const { setTheme } = useTheme();

  const { data } = useQuery(convexQuery(api.users.currentUser));

  return (
    <div className="flex items-center w-full h-auto gap-2 px-3 py-2">
      <SidebarTrigger className="md:hidden shrink-0" />
      <div className="flex items-center gap-2">
        <img src="/logo.png" className="w-10 sm:w-14" />
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <NotificationTray />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="flex items-center gap-2 cursor-pointer">
              <Avatar>
                <AvatarImage src={data?.image} />
                <AvatarFallback>
                  {data?.firstName?.charAt(0) ?? data?.email?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col">
                <Activity mode={data?.name ? 'visible' : 'hidden'}>
                  <Label>{data?.name}</Label>
                </Activity>
                <Label className="text-muted-foreground">{data?.email}</Label>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <Link to="/profile">
                <DropdownMenuItem>
                  <IdCardIcon />
                  <Label>Profile</Label>
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunMoonIcon />
                  <Label>Theme</Label>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme('light')}>
                    <SunIcon />
                    <Label>Light</Label>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    <MoonIcon />
                    <Label>Dark</Label>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('system')}>
                    <ComputerIcon />
                    <Label>System</Label>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
                <LogOutIcon />
                <Label>Log Out</Label>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
