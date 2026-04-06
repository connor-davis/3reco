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
import { Textarea } from '@/components/ui/textarea';
import { useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useMutation } from '@tanstack/react-query';
import { StarIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConvexError } from 'convex/values';
import { cn } from '@/lib/utils';

interface ReviewDialogProps {
  transactionId: Id<'transactions'>;
  sellerName: string;
  children: React.ReactNode;
}

export default function ReviewDialog({ transactionId, sellerName, children }: ReviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');

  const addReview = useConvexMutation(api.reviews.addReview);
  const { mutate, isPending } = useMutation({
    mutationFn: addReview,
    onSuccess: () => {
      toast.success('Review submitted!');
      setOpen(false);
      setRating(0);
      setComment('');
    },
    onError: (error) => {
      if (error instanceof ConvexError) {
        toast.error(error.data.name, { description: error.data.message });
      } else {
        toast.error(error.message);
      }
    },
  });

  function handleSubmit() {
    if (rating === 0) {
      toast.error('Please select a star rating.');
      return;
    }
    mutate({ transactionId, rating, comment: comment.trim() || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span />}>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {sellerName}</DialogTitle>
          <DialogDescription>Rate this seller.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Star picker */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                className="p-0.5 focus:outline-none"
              >
                <StarIcon
                  className={cn(
                    'size-7 transition-colors',
                    (hover || rating) >= star
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-muted-foreground/30'
                  )}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
              </span>
            )}
          </div>

          {/* Comment */}
          <Textarea
            placeholder="Optional comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSubmit} disabled={isPending || rating === 0}>
            Submit Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
