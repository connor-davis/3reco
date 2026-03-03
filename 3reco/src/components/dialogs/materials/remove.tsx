import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
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
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            material record from the database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              toast.promise(removeMaterial({ _id }), {
                loading: 'Removing the material...',
                error: 'Failed to remove the material. Please try again.',
                success: () => {
                  setOpen(false);

                  return 'The material has been removed.';
                },
              })
            }
          >
            Remove Material
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
