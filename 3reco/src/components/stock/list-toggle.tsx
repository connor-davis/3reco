import { Button } from '@/components/ui/button';
import { useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ConvexError } from 'convex/values';
import { StoreIcon, EyeOffIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function ListToggle({
  _id,
  isListed,
}: {
  _id: Id<'stock'>;
  isListed: boolean;
}) {
  const update = useConvexMutation(api.stock.update);

  return (
    <Button
      variant={isListed ? 'outline' : 'secondary'}
      size="sm"
      onClick={() =>
        toast.promise(update({ _id, isListed: !isListed }), {
          loading: isListed ? 'Removing from market...' : 'Listing on market...',
          success: isListed ? 'Removed from market.' : 'Listed on market!',
          error: (error: Error) => {
            if (error instanceof ConvexError) {
              return { message: error.data.name, description: error.data.message };
            }
            return { message: error.name, description: error.message };
          },
        })
      }
    >
      {isListed ? <EyeOffIcon /> : <StoreIcon />}
      <span className="hidden sm:inline">{isListed ? 'Unlist' : 'List on Market'}</span>
    </Button>
  );
}
