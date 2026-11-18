import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { Bell, BellRing, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorText } from '@/components/transactions/pager-state';
import {
  useCanSave,
  useFavouriteIds,
  useFollowIds,
  useFollowStore,
  useSaveListing,
  useUnfollowStore,
  useUnsaveListing,
} from '@/lib/api/favourites';
import { cn } from '@/lib/utils';

/**
 * A heart that saves a listing for the signed-in person. On a card it is a
 * round icon over the photo; with `labelled` it is a normal button.
 */
export function FavouriteButton({
  listingId,
  name,
  labelled = false,
  className,
}: {
  listingId: string;
  name: string;
  labelled?: boolean;
  className?: string;
}) {
  const canSave = useCanSave();
  const ids = useFavouriteIds();
  const save = useSaveListing();
  const unsave = useUnsaveListing();
  const navigate = useNavigate();
  if (!canSave) return null;

  const saved = ids.data?.ids.includes(listingId) ?? false;
  const busy = save.isPending || unsave.isPending || ids.isPending;
  const label = saved ? `Remove ${name} from saved` : `Save ${name}`;

  return (
    <Button
      type="button"
      variant={labelled ? 'outline' : 'secondary'}
      size={labelled ? 'default' : 'icon'}
      aria-pressed={saved}
      aria-label={label}
      disabled={busy}
      className={cn(
        !labelled && 'rounded-full bg-background/90 shadow-sm',
        className
      )}
      onClick={() =>
        (saved ? unsave : save).mutate(listingId, {
          // Point to the Saved page, so a new saver learns where it went.
          onSuccess: () => {
            if (saved) return;
            toast.success('Saved', {
              action: {
                label: 'View',
                onClick: () => void navigate({ to: '/saved' }),
              },
            });
          },
          onError: (error) => toast.error(errorText(error)),
        })
      }
    >
      <Heart
        aria-hidden="true"
        className={cn(saved && 'fill-primary text-primary')}
      />
      {labelled && (saved ? 'Saved' : 'Save')}
    </Button>
  );
}

/** Follow or unfollow a store. Followers hear when it lists something new. */
export function FollowButton({
  storeId,
  name,
  className,
}: {
  storeId: string;
  name: string;
  className?: string;
}) {
  const canSave = useCanSave();
  const ids = useFollowIds();
  const follow = useFollowStore();
  const unfollow = useUnfollowStore();
  if (!canSave) return null;

  const following = ids.data?.ids.includes(storeId) ?? false;
  const Icon = following ? BellRing : Bell;

  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={following}
      aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
      disabled={follow.isPending || unfollow.isPending || ids.isPending}
      className={className}
      onClick={() =>
        (following ? unfollow : follow).mutate(storeId, {
          onError: (error) => toast.error(errorText(error)),
        })
      }
    >
      <Icon aria-hidden="true" />
      <span data-slot="follow-text">{following ? 'Following' : 'Follow'}</span>
    </Button>
  );
}
