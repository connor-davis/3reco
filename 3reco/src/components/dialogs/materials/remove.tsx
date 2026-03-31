import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ConvexError } from 'convex/values';
import { TrashIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';

export default function RemoveMaterialByIdDialog({
  _id,
  children,
}: {
  children?: ReactElement;
  _id: Id<'materials'>;
}) {
  const removeMaterial = useConvexMutation(api.materials.remove);

  const [open, setOpen] = useState<boolean>(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          children ? (
            children
          ) : (
            <Button variant="ghost">
              <TrashIcon className="size-4" />
              <Label>Remove</Label>
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this material?</DialogTitle>
          <DialogDescription>
            This will permanently remove the material from your list.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            onClick={() =>
              toast.promise(removeMaterial({ _id }), {
                loading: 'Deleting material...',
                error: (error: Error) => {
                  if (error instanceof ConvexError) {
                    return {
                      message: error.data.name,
                      description: error.data.message,
                    };
                  }

                  return {
                    message: error.name,
                    description: error.message,
                  };
                },
                success: () => {
                  setOpen(false);

                  return 'Material deleted.';
                },
              })
            }
          >
            Delete material
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
