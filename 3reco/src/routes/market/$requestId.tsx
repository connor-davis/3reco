import BackButton from '@/components/back-button';
import MessageThread from '@/components/market/message-thread';
import { Badge } from '@/components/ui/badge';
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { ConvexError } from 'convex/values';
import { CheckIcon, SendIcon, UndoIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

export const Route = createFileRoute('/market/$requestId')({
  component: RouteComponent,
});

const offerItemSchema = z.object({
  materialId: z.string(),
  materialName: z.string(),
  offerWeight: z
    .number({ error: 'Please provide a weight.' })
    .positive({ error: 'Weight must be greater than zero.' }),
  offerPrice: z
    .number({ error: 'Please provide a price.' })
    .positive({ error: 'Price must be greater than zero.' }),
});

const offerSchema = z.object({
  items: z.array(offerItemSchema).min(1),
});

const statusVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  offered: 'outline',
  accepted: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
};

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  offered: 'Offer Made',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function RouteComponent() {
  const { requestId } = Route.useParams();
  const [offerOpen, setOfferOpen] = useState(false);

  const request = useConvexQuery(api.transactionRequests.findById, {
    _id: requestId as Id<'transactionRequests'>,
  });
  const currentUser = useConvexQuery(api.users.currentUser, {});
  const materials = useConvexQuery(api.materials.list, {});
  const counterparty = useConvexQuery(
    api.users.findById,
    request && currentUser
      ? {
          _id:
            currentUser._id === request.sellerId
              ? request.buyerId
              : request.sellerId,
        }
      : 'skip'
  );

  const makeOffer = useConvexMutation(api.transactionRequests.makeOffer);
  const acceptOffer = useConvexMutation(api.transactionRequests.acceptOffer);
  const declineOffer = useConvexMutation(api.transactionRequests.declineOffer);
  const withdrawOffer = useConvexMutation(api.transactionRequests.withdrawOffer);
  const rejectRequest = useConvexMutation(api.transactionRequests.reject);
  const cancelRequest = useConvexMutation(api.transactionRequests.cancel);

  const materialMap = new Map(materials?.map((m) => [m._id, m]) ?? []);

  // Normalise items for display
  const requestItems = request?.items ??
    (request?.materialId
      ? [{ materialId: request.materialId, stockId: undefined as unknown as Id<'stock'> }]
      : []);

  const offerForm = useForm<z.infer<typeof offerSchema>>({
    resolver: zodResolver(offerSchema),
    values: {
      items: requestItems.map((item) => ({
        materialId: item.materialId ?? '',
        materialName: item.materialId ? (materialMap.get(item.materialId as Id<'materials'>)?.name ?? '') : '',
        offerWeight: (item as { offerWeight?: number }).offerWeight ?? 0,
        offerPrice: (item as { offerPrice?: number }).offerPrice ?? 0,
      })),
    },
  });

  const { fields } = useFieldArray({ control: offerForm.control, name: 'items' });

  if (!request || !currentUser) {
    return (
      <div className="flex flex-col w-full h-full gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <Skeleton className="w-48 h-5" />
        </div>
        <Skeleton className="w-full h-24 rounded-2xl" />
      </div>
    );
  }

  const isSeller = currentUser._id === request.sellerId;
  const isPending = request.status === 'pending';
  const isOffered = request.status === 'offered';

  const handleMutationError = (error: Error) => {
    if (error instanceof ConvexError) {
      return { message: error.data.name, description: error.data.message };
    }
    return { message: error.name, description: error.message };
  };

  // Title: first material or "N materials"
  const titleItems = requestItems.map((item) =>
    item.materialId ? (materialMap.get(item.materialId as Id<'materials'>)?.name ?? 'Unknown') : 'Unknown'
  );
  const titleText = titleItems.length === 0
    ? 'Request'
    : titleItems.length === 1
      ? titleItems[0]
      : `${titleItems[0]} +${titleItems.length - 1} more`;

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center w-full h-auto gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BackButton />
          <Label className="text-lg truncate">{titleText}</Label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusVariant[request.status]}>
            {statusLabel[request.status] ?? request.status}
          </Badge>

          {/* Seller: pending → Make Offer + Reject */}
          {isSeller && isPending && (
            <>
              <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <SendIcon />
                  <span className="hidden sm:inline">Make Offer</span>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Make an Offer</DialogTitle>
                    <DialogDescription>
                      Set the weight and price for each requested item. The buyer
                      will need to accept before the transaction is finalised.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    id="form-make-offer"
                    className="flex flex-col gap-4"
                    onSubmit={offerForm.handleSubmit((values) =>
                      toast.promise(
                        makeOffer({
                          _id: requestId as Id<'transactionRequests'>,
                          offerItems: values.items.map((item) => ({
                            materialId: item.materialId as Id<'materials'>,
                            offerWeight: item.offerWeight,
                            offerPrice: item.offerPrice,
                          })),
                        }),
                        {
                          loading: 'Sending offer...',
                          success: () => {
                            setOfferOpen(false);
                            return 'Offer sent to buyer!';
                          },
                          error: handleMutationError,
                        }
                      )
                    )}
                  >
                    {fields.map((field, index) => (
                      <FieldGroup key={field.id} className="gap-2 p-3 border rounded-lg">
                        <Label className="text-xs text-muted-foreground font-medium">
                          {offerForm.watch(`items.${index}.materialName`) || `Item ${index + 1}`}
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Controller
                            name={`items.${index}.offerWeight`}
                            control={offerForm.control}
                            render={({ field: f, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel>Weight (kg)</FieldLabel>
                                <Input
                                  {...f}
                                  type="number"
                                  step={0.01}
                                  placeholder="e.g. 100"
                                  onChange={(e) => f.onChange(e.target.valueAsNumber)}
                                />
                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                              </Field>
                            )}
                          />
                          <Controller
                            name={`items.${index}.offerPrice`}
                            control={offerForm.control}
                            render={({ field: f, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel>Price (R/kg)</FieldLabel>
                                <Input
                                  {...f}
                                  type="number"
                                  step={0.01}
                                  placeholder="e.g. 15.50"
                                  onChange={(e) => f.onChange(e.target.valueAsNumber)}
                                />
                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                              </Field>
                            )}
                          />
                        </div>
                      </FieldGroup>
                    ))}
                  </form>
                  <DialogFooter showCloseButton>
                    <Button type="submit" form="form-make-offer">
                      Send Offer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  toast.promise(
                    rejectRequest({ _id: requestId as Id<'transactionRequests'> }),
                    {
                      loading: 'Rejecting request...',
                      success: 'Request rejected.',
                      error: handleMutationError,
                    }
                  )
                }
              >
                <XIcon />
                <span className="hidden sm:inline">Reject</span>
              </Button>
            </>
          )}

          {/* Seller: offered → Withdraw Offer + Reject */}
          {isSeller && isOffered && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast.promise(
                    withdrawOffer({ _id: requestId as Id<'transactionRequests'> }),
                    {
                      loading: 'Withdrawing offer...',
                      success: 'Offer withdrawn.',
                      error: handleMutationError,
                    }
                  )
                }
              >
                <UndoIcon />
                <span className="hidden sm:inline">Withdraw</span>
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  toast.promise(
                    rejectRequest({ _id: requestId as Id<'transactionRequests'> }),
                    {
                      loading: 'Rejecting request...',
                      success: 'Request rejected.',
                      error: handleMutationError,
                    }
                  )
                }
              >
                <XIcon />
                <span className="hidden sm:inline">Reject</span>
              </Button>
            </>
          )}

          {/* Buyer: pending or offered → Cancel */}
          {!isSeller && (isPending || isOffered) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.promise(
                  cancelRequest({ _id: requestId as Id<'transactionRequests'> }),
                  {
                    loading: 'Cancelling request...',
                    success: 'Request cancelled.',
                    error: handleMutationError,
                  }
                )
              }
            >
              <XIcon />
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          )}

          {/* Buyer: offered → Accept + Decline */}
          {!isSeller && isOffered && (
            <>
              <Button
                size="sm"
                onClick={() =>
                  toast.promise(
                    acceptOffer({ _id: requestId as Id<'transactionRequests'> }),
                    {
                      loading: 'Accepting offer...',
                      success: 'Offer accepted! Transaction complete.',
                      error: handleMutationError,
                    }
                  )
                }
              >
                <CheckIcon />
                <span className="hidden sm:inline">Accept Offer</span>
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  toast.promise(
                    declineOffer({ _id: requestId as Id<'transactionRequests'> }),
                    {
                      loading: 'Declining offer...',
                      success: 'Offer declined. The seller can make a new offer.',
                      error: handleMutationError,
                    }
                  )
                }
              >
                <XIcon />
                <span className="hidden sm:inline">Decline</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="text-muted-foreground text-sm shrink-0">
        {isSeller ? 'Buyer' : 'Seller'}:{' '}
        {counterparty?.businessName ?? counterparty?.firstName ?? '...'}
      </div>

      {/* Items table */}
      <div className="rounded-xl border overflow-hidden text-sm shrink-0">
        <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-muted text-muted-foreground font-medium text-xs">
          <span>Material</span>
          <span className="text-right">Offered Weight</span>
          <span className="text-right">Price/kg</span>
          <span className="text-right">Total</span>
        </div>
        {requestItems.map((item, i) => {
          const matName = item.materialId
            ? (materialMap.get(item.materialId as Id<'materials'>)?.name ?? 'Unknown')
            : 'Unknown';
          const offerWeight = (item as { offerWeight?: number }).offerWeight;
          const offerPrice = (item as { offerPrice?: number }).offerPrice;
          return (
            <div key={i} className="grid grid-cols-4 gap-2 px-3 py-2 border-t">
              <span>{matName}</span>
              <span className="text-right">{offerWeight != null ? `${offerWeight} kg` : '—'}</span>
              <span className="text-right">{offerPrice != null ? `R${offerPrice.toFixed(2)}` : '—'}</span>
              <span className="text-right">
                {offerWeight != null && offerPrice != null
                  ? `R${(offerWeight * offerPrice).toFixed(2)}`
                  : '—'}
              </span>
            </div>
          );
        })}
        {isOffered && (
          <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t bg-muted/50 font-medium">
            <span className="col-span-3 text-right">Grand Total</span>
            <span className="text-right">
              R{requestItems.reduce((sum, item) => {
                const ow = (item as { offerWeight?: number }).offerWeight ?? 0;
                const op = (item as { offerPrice?: number }).offerPrice ?? 0;
                return sum + ow * op;
              }, 0).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <MessageThread requestId={requestId as Id<'transactionRequests'>} />
      </div>
    </div>
  );
}
