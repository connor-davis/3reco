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
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  ComputerIcon,
  IdCardIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  SunMoonIcon,
} from 'lucide-react';
import { Label } from './ui/label';
import { Activity } from 'react';
import { useTheme } from './providers/theme';

export default function Header() {
  const { signOut } = useAuthActions();
  const { setTheme } = useTheme();

  const { data } = useQuery(convexQuery(api.users.currentUser));

  return (
    <div className="flex items-center w-full h-auto gap-3 p-3">
      <div className="flex items-center gap-3">
        <img src="/logo.png" className="w-16" />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={data?.image} />
                  <AvatarFallback>
                    {data?.firstName?.charAt(0) ?? data?.email?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <Activity mode={data?.name ? 'visible' : 'hidden'}>
                    <Label>{data?.name}</Label>
                  </Activity>
                  <Label className="text-muted-foreground">{data?.email}</Label>
                </div>
              </div>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IdCardIcon />
                <Label>Profile</Label>
              </DropdownMenuItem>
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
              <DropdownMenuItem variant="destructive" onClick={() => signOut()}>
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
