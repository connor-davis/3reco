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
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ConvexError } from 'convex/values';
import { HandshakeIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function RequestDialog({
  sellerId,
  materialId,
  stockId,
}: {
  sellerId: Id<'users'>;
  materialId: Id<'materials'>;
  stockId: Id<'stock'>;
}) {
  const [open, setOpen] = useState(false);
  const material = useConvexQuery(api.materials.findById, { _id: materialId });
  const currentUser = useConvexQuery(api.users.currentUser, {});
  const createRequest = useConvexMutation(api.transactionRequests.create);

  // Admin and staff cannot make market requests
  if (currentUser && (currentUser.type === 'admin' || currentUser.type === 'staff')) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <HandshakeIcon />
        Request
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request {material?.name ?? 'Stock'}</DialogTitle>
          <DialogDescription>
            This will send a request to the seller. You can negotiate the terms
            through messages before anything is finalised.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button
            onClick={() =>
              toast.promise(createRequest({ sellerId, items: [{ materialId, stockId }] }), {
                loading: 'Sending request...',
                success: () => {
                  setOpen(false);
                  return 'Request sent!';
                },
                error: (error: Error) => {
                  if (error instanceof ConvexError) {
                    return {
                      message: error.data.name,
                      description: error.data.message,
                    };
                  }
                  return { message: error.name, description: error.message };
                },
              })
            }
          >
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

