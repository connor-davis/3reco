import { Package } from 'lucide-react';

/** One stock photo, or the shared material placeholder. */
export function Gallery({ image, name }: { image?: string; name: string }) {
  return (
    <div className="relative flex aspect-[4/3] w-full max-h-64 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground lg:max-h-none lg:max-w-md">
      {image ? (
        <img
          src={image}
          alt={name}
          className="absolute inset-0 size-full object-cover object-center"
        />
      ) : (
        <Package
          className="size-16"
          strokeWidth={1}
          role="img"
          aria-label="Material placeholder"
        />
      )}
    </div>
  );
}
