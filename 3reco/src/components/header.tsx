import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import { buildAuthPath } from '@/lib/auth-flow';
import {
  getSessionAccountLabel,
  normalizeBetterAuthDeviceSessions,
  revokeBrowserAccounts,
} from '@/lib/auth-multi-session';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  CheckCircle2Icon,
  ComputerIcon,
  IdCardIcon,
  LogOutIcon,
  MoonIcon,
  PlusCircleIcon,
  SunIcon,
  SunMoonIcon,
  UsersIcon,
} from 'lucide-react';
import { Activity } from 'react';
import { toast } from 'sonner';
import NotificationTray from './notifications/tray';
import { useTheme } from './providers/theme';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Label } from './ui/label';
import { SidebarTrigger } from './ui/sidebar';

export default function Header() {
  const { setTheme } = useTheme();
  const queryClient = useQueryClient();

  const { data } = useQuery(convexQuery(api.users.currentUser));
  const sessionState = authClient.useSession();
  const deviceSessionsQuery = useQuery({
    queryKey: ['auth', 'device-sessions'],
    queryFn: () => authClient.multiSession.listDeviceSessions(),
  });
  const switchAccountMutation = useMutation({
    mutationFn: async (sessionToken: string) => {
      await authClient.multiSession.setActive({
        sessionToken,
      });
    },
  });
  const signOutAllAccountsMutation = useMutation({
    mutationFn: async () => {
      await revokeBrowserAccounts(
        normalizeBetterAuthDeviceSessions(deviceSessionsQuery.data),
        sessionState.data?.session.id,
        (sessionToken) =>
          authClient.revokeSession({
            token: sessionToken,
          })
      );
    },
  });
  const currentSessionId = sessionState.data?.session.id;
  const deviceSessions = normalizeBetterAuthDeviceSessions(deviceSessionsQuery.data);

  const refreshSessionState = async () => {
    await Promise.all([
      queryClient.invalidateQueries(),
      sessionState.refetch(),
    ]);
  };

  const startAddAccountFlow = () => {
    const currentPath = `${window.location.pathname}${window.location.search}`;
    window.location.assign(
      buildAuthPath('/auth/sign-in', {
        mode: 'add-account',
        returnTo: currentPath,
      })
    );
  };

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
                    <Link to="/profile" search={{ tab: undefined }}>
                      <DropdownMenuItem>
                        <IdCardIcon />
                        <Label>Profile</Label>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <UsersIcon />
                        <Label>Accounts</Label>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuLabel>
                          Signed in on this browser
                        </DropdownMenuLabel>
                        {deviceSessions.length > 0 ? (
                          <DropdownMenuRadioGroup value={currentSessionId}>
                            {deviceSessions.map((entry) => {
                              const session = entry.session;

                              return (
                                <DropdownMenuRadioItem
                                  key={session.id}
                                  value={session.id}
                                  onClick={() => {
                                    if (session.id === currentSessionId) {
                                      return;
                                    }

                                    void toast.promise(
                                      switchAccountMutation
                                        .mutateAsync(session.token)
                                        .then(async () => {
                                          await refreshSessionState();
                                        }),
                                      {
                                        loading: 'Switching account...',
                                        success: 'Account switched.',
                                        error: (error: Error) => ({
                                          message: 'Unable to switch accounts',
                                          description: error.message,
                                        }),
                                      }
                                    );
                                  }}
                                >
                                  <div className="flex min-w-0 flex-col">
                                    <span className="truncate">
                                      {getSessionAccountLabel(entry)}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground">
                                      {entry.user.email ?? 'No email available'}
                                    </span>
                                  </div>
                                </DropdownMenuRadioItem>
                              );
                            })}
                          </DropdownMenuRadioGroup>
                        ) : (
                          <DropdownMenuItem disabled>
                            <Label>No saved accounts yet</Label>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={startAddAccountFlow}>
                          <PlusCircleIcon />
                          <Label>Add another account</Label>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={
                            signOutAllAccountsMutation.isPending ||
                            deviceSessions.length === 0
                          }
                          onClick={() =>
                            void toast.promise(
                              signOutAllAccountsMutation.mutateAsync(),
                              {
                                loading: 'Signing out all accounts...',
                                success: 'All browser accounts signed out.',
                                error: (error: Error) => ({
                                  message: 'Unable to sign out all accounts',
                                  description: error.message,
                                }),
                              }
                            )
                          }
                        >
                          <CheckCircle2Icon />
                          <Label>Sign out all accounts</Label>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
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
                      onClick={() =>
                        void toast.promise(authClient.signOut(), {
                          loading: 'Signing out...',
                          success: 'Signed out.',
                          error: (error: Error) => ({
                            message: 'Unable to sign out',
                            description: error.message,
                          }),
                        })
                      }
                    >
                      <LogOutIcon />
                      <Label>Sign out current account</Label>
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
