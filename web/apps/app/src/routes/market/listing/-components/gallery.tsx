import { useState } from 'react';
import { MaterialThumb } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Material } from '@/lib/types';
import { cn } from '@/lib/utils';

const variants = [0, 1, 2];

/**
 * Phones swipe the Carousel. Larger screens show one big image with three
 * thumbnail buttons under it.
 */
export function Gallery({ category }: { category: Material['category'] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="space-y-3">
      <Carousel className="sm:hidden">
        <CarouselContent>
          {variants.map((variant) => (
            <CarouselItem key={variant}>
              <MaterialThumb
                category={category}
                variant={variant}
                className="aspect-[4/3] rounded-2xl"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <Tooltip>
          <TooltipTrigger render={<CarouselPrevious className="left-2" />} />
          <TooltipContent>Previous image</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<CarouselNext className="right-2" />} />
          <TooltipContent>Next image</TooltipContent>
        </Tooltip>
      </Carousel>
      <div className="hidden space-y-3 sm:block">
        <MaterialThumb
          category={category}
          variant={active}
          className="aspect-[4/3] rounded-2xl"
        />
        <div className="flex gap-3">
          {variants.map((variant) => (
            <Tooltip key={variant}>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    aria-label={`Show material image ${variant + 1}`}
                    aria-pressed={variant === active}
                    className={cn(
                      'h-auto w-24 p-1',
                      variant === active && 'border-primary'
                    )}
                    onClick={() => setActive(variant)}
                  />
                }
              >
                <MaterialThumb
                  category={category}
                  variant={variant}
                  className="aspect-[4/3] w-full rounded-lg"
                />
              </TooltipTrigger>
              <TooltipContent>{`Image ${variant + 1}`}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Illustrative material sample · confirm quality with the seller.
      </p>
    </div>
  );
}
