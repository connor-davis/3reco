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
import { useMockList, useProfile } from '@/lib/mock/hooks';
import { cn } from '@/lib/utils';

const schema = z.object({
  rating: z.number().min(1, 'Pick a star rating.'),
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
  const reviews = useMockList('reviews');
  const { profile } = useProfile();
  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { rating: 0, comment: '' },
  });

  function onSubmit(values: Values) {
    reviews.add({
      id: `rev-${reviews.items.length + 1}`,
      storeId,
      reviewer: `${profile.firstName} · ${profile.businessName}`,
      rating: values.rating,
      comment: values.comment,
      date: new Date().toISOString().slice(0, 10),
      mine: true,
    });
    toast.success('Review posted.');
    reset();
    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Leave a review"
      description="Tell other businesses how the trade went."
      footer={<Button onClick={handleSubmit(onSubmit)}>Post review</Button>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
                  onValueChange={(next) => field.onChange(Number(next[0] ?? 0))}
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
      </form>
    </ResponsiveOverlay>
  );
}
