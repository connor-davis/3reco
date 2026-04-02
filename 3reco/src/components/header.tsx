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
import { authClient } from '@/lib/auth-client';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ComputerIcon,
  IdCardIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  SunMoonIcon,
} from 'lucide-react';
import { Activity } from 'react';
import NotificationTray from './notifications/tray';
import { useTheme } from './providers/theme';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Label } from './ui/label';
import { SidebarTrigger } from './ui/sidebar';

export default function Header() {
  const { setTheme } = useTheme();

  const { data } = useQuery(convexQuery(api.users.currentUser));

  return (
    <header className="sticky top-0 z-30 rounded-bl-xl border-l border-b border-border/80 bg-background">
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
        <SidebarTrigger className="shrink-0 md:hidden" />

        <img src="/logo.png" alt="Logo" className="w-20 shrink-0" />

        <div className="flex min-w-0 flex-1 items-center gap-2 md:ml-4">
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1">
              <NotificationTray />

              <DropdownMenu>
                <DropdownMenuTrigger>
                  <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/60 rounded-md">
                    <Avatar className="size-9 border border-border/80 bg-primary/15">
                      <AvatarImage src={data?.image} />
                      <AvatarFallback className="bg-primary/15 font-semibold text-primary">
                        {data?.firstName?.charAt(0) ??
                          data?.email?.charAt(0) ??
                          'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden min-w-0 text-left sm:block">
                      <Activity mode={data?.name ? 'visible' : 'hidden'}>
                        <Label className="truncate text-sm font-semibold text-foreground">
                          {data?.name}
                        </Label>
                      </Activity>
                      <Label className="max-w-[10rem] truncate text-xs text-muted-foreground">
                        {data?.email}
                      </Label>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
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
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void authClient.signOut()}
                    >
                      <LogOutIcon />
                      <Label>Log Out</Label>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
