import { zodResolver } from '@hookform/resolvers/zod';
import { Star } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { TextareaField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCreateReview, useReviewable } from '@/lib/api/reviews';
import { DataState } from '@/components/data-state';
import { SelectField } from '@/components/form-fields';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const schema = z.object({
  transaction_id: z.string().min(1, 'Choose a completed trade.'),
  rating: z.number().min(1, 'Pick a star rating.').max(5),
  comment: z.string().max(300, 'Keep it under 300 characters.'),
});

type Values = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
};

/** Leave a review: 1 to 5 stars and an optional comment. */
export function ReviewDialog({ open, onOpenChange, storeId }: Props) {
  const eligible = useReviewable(storeId);
  const { control, handleSubmit, reset, watch, setError, formState } =
    useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: { transaction_id: '', rating: 0, comment: '' },
    });

  const create = useCreateReview(watch('transaction_id'));

  async function onSubmit(values: Values) {
    try {
      await create.mutateAsync({
        rating: values.rating,
        comment: values.comment,
      });
      toast.success('Review posted.');
      reset();
      onOpenChange(false);
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error
            ? error.message
            : 'Review could not be posted. Try again.',
      });
      void eligible.refetch();
    }
  }
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Leave a review"
      description="Tell other businesses how the trade went."
      footer={
        <Button
          className="min-h-11"
          disabled={
            create.isPending ||
            eligible.isPending ||
            eligible.isError ||
            !eligible.data?.items.length
          }
          onClick={handleSubmit(onSubmit)}
        >
          {create.isPending ? 'Posting…' : 'Post review'}
        </Button>
      }
    >
      <DataState
        query={eligible}
        isEmpty={eligible.data?.items.length === 0}
        icon={Star}
        emptyTitle="No trades to review"
        emptyText="Complete a trade with this store before leaving a review."
      >
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <SelectField
            control={control}
            name="transaction_id"
            label="Completed trade"
            options={(eligible.data?.items ?? []).map((trade) => ({
              value: trade.transaction_id,
              label:
                formatDate(trade.created_at) + ' · ' + trade.transaction_id,
            }))}
          />
          <Controller
            control={control}
            name="rating"
            render={({ field, fieldState }) => (
              <FieldSet>
                <FieldLegend variant="label">Your rating</FieldLegend>
                <Field data-invalid={fieldState.invalid}>
                  <ToggleGroup
                    aria-label="Star rating"
                    value={field.value ? [String(field.value)] : []}
                    onValueChange={(next) =>
                      field.onChange(Number(next[0] ?? 0))
                    }
                  >
                    {[1, 2, 3, 4, 5].map((star) => (
                      <ToggleGroupItem
                        key={star}
                        value={String(star)}
                        aria-label={`${star} star${star === 1 ? '' : 's'}`}
                      >
                        <Star
                          className={cn(
                            star <= field.value && 'fill-chart-3 text-chart-3'
                          )}
                        />
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              </FieldSet>
            )}
          />
          <TextareaField
            control={control}
            name="comment"
            label="Comment (optional)"
            rows={3}
          />
          {formState.errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {formState.errors.root.message}
            </p>
          )}
        </form>
      </DataState>
    </ResponsiveOverlay>
  );
}
