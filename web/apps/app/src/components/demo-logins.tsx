import { Button } from '@/components/ui/button';
import { useAppConfig } from '@/lib/api/app-config';
import { demoLogins, demoPassword } from '@/lib/demo-logins';

/** One-click sign-ins for the demo site. Shows nothing anywhere else. */
export function DemoLogins({
  onPick,
  disabled,
}: {
  onPick: (login: { email: string; password: string }) => void;
  disabled?: boolean;
}) {
  const { demo } = useAppConfig();

  if (!demo) return null;

  return (
    <section aria-label="Demo sign-ins" className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Try the demo as one of these people:
      </p>
      {demoLogins.map((login) => (
        <Button
          key={login.email}
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={disabled}
          onClick={() => onPick({ email: login.email, password: demoPassword })}
        >
          <span>Sign in as {login.role}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {login.note}
          </span>
        </Button>
      ))}
    </section>
  );
}
