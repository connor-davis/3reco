import { Link, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

type BackButtonProps = {
  /** Where to go when there is no page to go back to, like a shared link. */
  fallback: string;
  className?: string;
};

/** The one back button: an arrow and "Go back", returning to the last page. */
export function BackButton({ fallback, className }: BackButtonProps) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // A plain link, not LinkButton: LinkButton tells screen readers it is a
  // button, but going back is moving to a page, which is what a link is.
  return (
    <Link
      to={fallback}
      className={cn(
        buttonVariants({ variant: 'ghost' }),
        '-ml-2.5 text-muted-foreground',
        className
      )}
      onClick={(event) => {
        // A real link keeps open-in-new-tab working; a plain click goes back
        // so the user lands on the same list, filters and scroll they left.
        const newTab = event.metaKey || event.ctrlKey || event.shiftKey;
        if (!canGoBack || newTab || event.button !== 0) return;
        event.preventDefault();
        router.history.back();
      }}
    >
      <ArrowLeft data-icon="inline-start" />
      Go back
    </Link>
  );
}
