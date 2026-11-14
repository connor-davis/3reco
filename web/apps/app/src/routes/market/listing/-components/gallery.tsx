import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

const frame =
  'relative flex aspect-[4/3] w-full max-h-64 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground lg:max-h-none lg:max-w-md';

const placeholder = (
  <Package
    className="size-16"
    strokeWidth={1}
    role="img"
    aria-label="Material placeholder"
  />
);

/** One slide. A broken file shows the placeholder until its URL changes. */
function Slide({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState<string>();

  return failed === src ? (
    placeholder
  ) : (
    <img
      src={src}
      alt={name}
      onError={() => setFailed(src)}
      className="absolute inset-0 size-full object-cover object-center"
    />
  );
}

/** Swipe or use the arrows through a listing's photos; thumbnails jump to one. */
export function Gallery({
  images = [],
  name,
}: {
  images?: string[];
  name: string;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const select = () => setCurrent(api.selectedScrollSnap());
    select();
    api.on('select', select);
    return () => {
      api.off('select', select);
    };
  }, [api]);

  if (images.length === 0) {
    return <div className={frame}>{placeholder}</div>;
  }

  return (
    <div className="space-y-2 lg:max-w-md">
      <Carousel
        setApi={setApi}
        className="w-full"
        aria-label={`${name} photos`}
      >
        <CarouselContent className="ml-0">
          {images.map((src) => (
            <CarouselItem key={src} className="pl-0">
              <div className={frame}>
                <Slide src={src} name={name} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {images.length > 1 && (
          <>
            <CarouselPrevious className="left-2 hidden sm:flex" />
            <CarouselNext className="right-2 hidden sm:flex" />
          </>
        )}
      </Carousel>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {images.map((src, index) => (
            <li key={src}>
              <button
                type="button"
                aria-label={`Show photo ${index + 1} of ${images.length}`}
                aria-current={index === current}
                onClick={() => api?.scrollTo(index)}
                className={cn(
                  'block size-14 overflow-hidden rounded-md border-2 bg-muted',
                  index === current ? 'border-primary' : 'border-transparent'
                )}
              >
                <img src={src} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
