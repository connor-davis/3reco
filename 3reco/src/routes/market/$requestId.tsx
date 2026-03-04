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
  FieldDescription,
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
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

export const Route = createFileRoute('/market/$requestId')({
  component: RouteComponent,
});

const offerSchema = z.object({
  weight: z
    .number({ error: 'Please provide a weight.' })
    .positive({ error: 'Weight must be greater than zero.' }),
  price: z
    .number({ error: 'Please provide a price.' })
    .positive({ error: 'Price must be greater than zero.' }),
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
  const material = useConvexQuery(
    api.materials.findById,
    request ? { _id: request.materialId } : 'skip'
  );
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

  const offerForm = useForm<z.infer<typeof offerSchema>>({
    resolver: zodResolver(offerSchema),
  });

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

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center w-full h-auto gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BackButton />
          <Label className="text-lg truncate">
            {material?.name ?? <Skeleton className="w-32 h-5 inline-block" />}
          </Label>
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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Make an Offer</DialogTitle>
                    <DialogDescription>
                      Propose a weight and price. The buyer will need to accept
                      before the transaction is finalised.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    id="form-make-offer"
                    className="flex flex-col gap-3"
                    onSubmit={offerForm.handleSubmit((values) =>
                      toast.promise(
                        makeOffer({
                          _id: requestId as Id<'transactionRequests'>,
                          weight: values.weight,
                          price: values.price,
                        }),
                        {
                          loading: 'Sending offer...',
                          success: () => {
                            setOfferOpen(false);
                            offerForm.reset({});
                            return 'Offer sent to buyer!';
                          },
                          error: handleMutationError,
                        }
                      )
                    )}
                  >
                    <FieldGroup className="gap-3">
                      <Controller
                        name="weight"
                        control={offerForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="form-offer-weight">
                              Weight (kg)
                            </FieldLabel>
                            <Input
                              {...field}
                              id="form-offer-weight"
                              type="number"
                              step={0.01}
                              placeholder="e.g. 100"
                              aria-invalid={fieldState.invalid}
                              onChange={(e) =>
                                field.onChange(e.target.valueAsNumber)
                              }
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                            <FieldDescription>
                              The weight in kilograms you are offering.
                            </FieldDescription>
                          </Field>
                        )}
                      />
                      <Controller
                        name="price"
                        control={offerForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="form-offer-price">
                              Price (R/kg)
                            </FieldLabel>
                            <Input
                              {...field}
                              id="form-offer-price"
                              type="number"
                              step={0.01}
                              placeholder="e.g. 15.50"
                              aria-invalid={fieldState.invalid}
                              onChange={(e) =>
                                field.onChange(e.target.valueAsNumber)
                              }
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                            <FieldDescription>
                              Price per kilogram in Rands.
                            </FieldDescription>
                          </Field>
                        )}
                      />
                    </FieldGroup>
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

      <div className="text-muted-foreground text-sm">
        {isSeller ? 'Buyer' : 'Seller'}:{' '}
        {counterparty?.businessName ?? counterparty?.firstName ?? '...'}
      </div>

      {/* Offer details panel — visible to buyer when an offer is active */}
      {!isSeller && isOffered && request.offerWeight != null && request.offerPrice != null && (
        <div className="rounded-xl border bg-muted/50 px-4 py-3 flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Offered weight</span>
            <p className="font-semibold">{request.offerWeight} kg</p>
          </div>
          <div>
            <span className="text-muted-foreground">Price per kg</span>
            <p className="font-semibold">R {request.offerPrice.toFixed(2)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total</span>
            <p className="font-semibold">
              R {(request.offerWeight * request.offerPrice).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      <MessageThread requestId={requestId as Id<'transactionRequests'>} />
    </div>
  );
}
