import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { ChoiceSelect } from '@/components/filters';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { roleLabels } from '@/lib/access';
import { useMock } from '@/lib/mock/hooks';
import { cn } from '@/lib/utils';
import type { PageState, Role } from '@/lib/types';

const roleOptions = (Object.keys(roleLabels) as Role[]).map((role) => ({
  value: role,
  label: roleLabels[role],
}));

const stateOptions: { value: PageState; label: string }[] = [
  { value: 'ready', label: 'Normal' },
  { value: 'loading', label: 'Loading' },
  { value: 'empty', label: 'Empty' },
  { value: 'error', label: 'Error' },
];

const tokenOptions = [
  { value: 'valid', label: 'Good link' },
  { value: 'expired', label: 'Expired link' },
  { value: 'missing', label: 'Missing token' },
];

type PreviewPillProps = {
  // "bar" is a small icon that lives in the phone top bar, clear of every
  // action band. "floating" is the labelled pill pinned to the corner.
  variant?: 'bar' | 'floating';
  className?: string;
};

/**
 * The Preview control. It is only for reviewing the mockup: it swaps the
 * role and the page state so every view can be seen without a backend.
 */
export function PreviewPill({
  variant = 'floating',
  className,
}: PreviewPillProps) {
  const { role, setRole, pageState, setPageState } = useMock();
  const bar = variant === 'bar';
  const navigate = useNavigate();
  const { pathname, token } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      token: (state.location.search as { token?: string }).token ?? 'valid',
    }),
  });

  return (
    <div className={cn(!bar && 'fixed z-40', className)}>
      <Popover>
        <PopoverTrigger
          render={
            bar ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Preview controls"
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="bg-popover shadow-md"
              />
            )
          }
        >
          <Eye data-icon={bar ? undefined : 'inline-start'} />
          {!bar && (
            <>
              Preview
              <Badge variant="secondary">{roleLabels[role]}</Badge>
            </>
          )}
        </PopoverTrigger>
        <PopoverContent
          align={bar ? 'end' : 'start'}
          side={bar ? 'bottom' : 'top'}
          className="w-72 gap-4"
        >
          <Field>
            <FieldLabel>Role</FieldLabel>
            <ChoiceSelect
              label="Preview role"
              value={role}
              options={roleOptions}
              onChange={(next) => setRole(next as Role)}
              className="w-full"
            />
          </Field>
          <Field>
            <FieldLabel>Page state</FieldLabel>
            <ChoiceSelect
              label="Preview page state"
              value={pageState}
              options={stateOptions}
              onChange={(next) => setPageState(next as PageState)}
              className="w-full"
            />
          </Field>
          {pathname === '/auth/reset-password' && (
            <Field>
              <FieldLabel>Reset link</FieldLabel>
              <ChoiceSelect
                label="Preview reset link"
                value={token}
                options={tokenOptions}
                onChange={(next) =>
                  navigate({
                    to: '/auth/reset-password',
                    search: { token: next as 'valid' | 'expired' | 'missing' },
                  })
                }
                className="w-full"
              />
            </Field>
          )}
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/" />}
            >
              Go to dashboard
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
