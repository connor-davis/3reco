import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DecimalField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useReplyToWanted, type WantedPost } from '@/lib/api/wanted';
import { toCents } from '@/lib/format';
import {
  priceCounter,
  priceError,
  quantityError,
  weightCounter,
} from '@/lib/quantity';

/** The seller's reply: the same weight and price fields as an offer. */
export function ReplyDialog({
  post,
  onClose,
}: {
  post: WantedPost | null;
  onClose: () => void;
}) {
  return (
    <ResponsiveOverlay
      open={!!post}
      onOpenChange={(open) => !open && onClose()}
      title="Reply to this post"
      description="Your offer reserves the stock for 48 hours. The buyer can then open a chat with you."
    >
      {post && <ReplyForm post={post} onDone={onClose} />}
    </ResponsiveOverlay>
  );
}

function ReplyForm({ post, onDone }: { post: WantedPost; onDone: () => void }) {
  const reply = useReplyToWanted();
  const navigate = useNavigate();

  const schema = z
    .object({ weight: z.string(), price: z.string() })
    .superRefine((value, ctx) => {
      const weight = quantityError(value.weight);
      if (weight) {
        ctx.addIssue({ code: 'custom', message: weight, path: ['weight'] });
      }

      const price =
        priceError(value.price) ??
        (post.max_price &&
        toCents(value.price.trim().replace(',', '.')) > toCents(post.max_price)
          ? 'This is more than the buyer will pay.'
          : undefined);
      if (price) {
        ctx.addIssue({ code: 'custom', message: price, path: ['price'] });
      }
    });

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { weight: post.weight, price: post.max_price ?? '' },
  });

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        try {
          const made = await reply.mutateAsync({
            id: post.id,
            material_id: post.material_id,
            weight: values.weight.trim().replace(',', '.'),
            price: values.price.trim().replace(',', '.'),
          });
          toast.success('Reply sent.');
          onDone();
          await navigate({
            to: '/market/$requestId',
            params: { requestId: made.id },
          });
        } catch (cause) {
          form.setError('root', {
            message:
              cause instanceof Error
                ? cause.message
                : 'Could not send this reply.',
          });
        }
      })}
    >
      <p className="font-medium">{post.material_name}</p>
      <DecimalField
        control={form.control}
        name="weight"
        label="Weight (kg)"
        counter={{ ...weightCounter(), unit: undefined }}
      />
      <DecimalField
        control={form.control}
        name="price"
        label="Price (R / kg)"
        counter={{ ...priceCounter(), unit: undefined }}
      />
      {form.formState.errors.root?.message && (
        <p role="alert" className="text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}
      <DialogFooter>
        <Button
          type="submit"
          disabled={reply.isPending || !form.formState.isValid}
        >
          Send reply
        </Button>
      </DialogFooter>
    </form>
  );
}
