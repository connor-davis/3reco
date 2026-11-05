import type { ComponentProps } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

type LinkButtonProps = Omit<ComponentProps<typeof Button>, 'render'> & {
  to: string;
  params?: Record<string, string>;
};

/** A shadcn Button that is really a router link, so it is keyboard-safe. */
export function LinkButton({ to, params, ...props }: LinkButtonProps) {
  return (
    <Button
      nativeButton={false}
      render={<Link to={to} params={params} />}
      {...props}
    />
  );
}
