import { useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, LogOut, Plus, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/providers/theme';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
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
import { roleLabels } from '@/lib/access';
import {
  useSessions,
  useSignOut,
  useSignOutAll,
  useSwitchSession,
} from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/use-auth';
import { ApiError } from '@/lib/api/client';

/** The account button in the top bar: profile, other sessions, theme, sign out. */
export function AccountMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const sessions = useSessions();
  const signOut = useSignOut();
  const signOutAll = useSignOutAll();
  const switchSession = useSwitchSession();

  if (!user) return null;

  function leave(all: boolean) {
    (all ? signOutAll : signOut).mutate(undefined, {
      onSuccess: () => {
        toast.success('You have been signed out.');
        navigate({ to: '/sign-in' });
      },
      onError: () => toast.error('We could not sign you out. Try again.'),
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto gap-2 px-2 py-1 max-[780px]:min-h-11"
            aria-label="Account menu"
          />
        }
      >
        <PersonAvatar name={user.name} />
        <span className="hidden min-w-0 text-left text-xs sm:block">
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block truncate text-muted-foreground">
            {user.role ? roleLabels[user.role] : 'No role yet'}
          </span>
        </span>
        <ChevronsUpDown className="hidden sm:block" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block font-medium text-foreground">
              {user.name}
            </span>
            <span className="block text-xs">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: '/profile' })}>
          <UserCircle />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Accounts in this browser
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {sessions.data?.sessions.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => {
                  if (session.current) return;

                  switchSession.mutate(session.id, {
                    onSuccess: () =>
                      toast.success(`Switched to ${session.email}.`),
                    onError: (error) => {
                      if (
                        error instanceof ApiError &&
                        [401, 404].includes(error.status)
                      ) {
                        void navigate({
                          to: '/sign-in',
                          search: {
                            add: true,
                            email: session.email ?? undefined,
                          },
                        });
                      } else {
                        toast.error('We could not switch account. Try again.');
                      }
                    },
                  });
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{session.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {session.current
                      ? 'Current session'
                      : (session.role && roleLabels[session.role]) ||
                        'Signed in'}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
            {sessions.isError && (
              <DropdownMenuItem onClick={() => void sessions.refetch()}>
                Could not load accounts. Try again.
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                navigate({ to: '/sign-in', search: { add: true } })
              }
            >
              <Plus />
              Add account
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => leave(true)}>
              Sign all out
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(next) =>
              setTheme(next as 'light' | 'dark' | 'system')
            }
          >
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => leave(false)}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
