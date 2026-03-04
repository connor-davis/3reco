import { StarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarsProps {
  rating: number | null;
  count?: number;
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export default function Stars({ rating, count, max = 5, size = 'md', className }: StarsProps) {
  const iconSize = size === 'sm' ? 'size-3' : 'size-4';

  if (rating === null) {
    return (
      <span className={cn('flex items-center gap-1 text-muted-foreground', className)}>
        {Array.from({ length: max }).map((_, i) => (
          <StarIcon key={i} className={cn(iconSize, 'text-muted-foreground/40')} />
        ))}
        {count !== undefined && (
          <span className="text-xs text-muted-foreground ml-0.5">No reviews</span>
        )}
      </span>
    );
  }

  return (
    <span className={cn('flex items-center gap-0.5', className)}>
      {Array.from({ length: max }).map((_, i) => (
        <StarIcon
          key={i}
          className={cn(
            iconSize,
            i < Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
          )}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        {rating.toFixed(1)}
        {count !== undefined && ` (${count})`}
      </span>
    </span>
  );
}
