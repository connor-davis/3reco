import { useState } from 'react';
import { Package } from 'lucide-react';

/** One stock photo, or the shared material placeholder. */
export function Gallery({ image, name }: { image?: string; name: string }) {
  const [failedImage, setFailedImage] = useState<string>();

  return (
    <div className="relative flex aspect-[4/3] w-full max-h-64 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground lg:max-h-none lg:max-w-md">
      {image && failedImage !== image ? (
        <img
          src={image}
          alt={name}
          onError={() => setFailedImage(image)}
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
