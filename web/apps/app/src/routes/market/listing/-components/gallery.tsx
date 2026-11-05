import { Package } from 'lucide-react';

// Listings do not carry photographs in the API.
export function Gallery() {
  return (
    <div
      className="flex aspect-square items-center justify-center rounded-3xl bg-muted text-muted-foreground"
      role="img"
      aria-label="Material placeholder"
    >
      <Package className="size-28" strokeWidth={1} />
    </div>
  );
}
