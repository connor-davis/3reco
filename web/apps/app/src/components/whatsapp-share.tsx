import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { whatsAppUrl } from '@/lib/share';

/** A link that opens WhatsApp with a short text and this page's address. */
export function WhatsAppShare({
  text,
  path,
  className,
}: {
  text: string;
  path: string;
  className?: string;
}) {
  return (
    <Button
      nativeButton={false}
      variant="outline"
      className={className}
      render={
        <a
          href={whatsAppUrl(text, path)}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <Share2 aria-hidden="true" />
      Share on WhatsApp
    </Button>
  );
}
