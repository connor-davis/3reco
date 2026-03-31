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
    <div className="sticky top-2 z-30 mx-2 flex w-auto flex-wrap items-center gap-2 rounded-[1.75rem] border border-[var(--glass-border)] bg-[var(--glass-shell)] px-3 py-2 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:top-3 sm:mx-3 sm:flex-nowrap">
      <SidebarTrigger className="md:hidden shrink-0" />
      <div className="flex items-center gap-2 rounded-2xl border border-white/35 bg-white/65 px-2 py-1 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-white/5">
        <img src="/logo.png" alt="3rEco" className="w-10 sm:w-14" />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <NotificationTray />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="flex min-w-0 cursor-pointer items-center gap-2 rounded-full border border-white/35 bg-white/65 px-2 py-1 shadow-[var(--shadow-soft)] backdrop-blur-md transition-colors hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
              <Avatar className="shrink-0 border border-white/40 dark:border-white/10">
                <AvatarImage src={data?.image} />
                <AvatarFallback>
                  {data?.firstName?.charAt(0) ?? data?.email?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden min-w-0 sm:flex sm:flex-col">
                <Activity mode={data?.name ? 'visible' : 'hidden'}>
                  <Label className="truncate">{data?.name}</Label>
                </Activity>
                <Label className="max-w-[10rem] truncate text-muted-foreground md:max-w-[14rem]">
                  {data?.email}
                </Label>
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
