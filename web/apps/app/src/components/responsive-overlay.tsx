import { useState, type ReactNode } from 'react';
import OverlayBody from './responsive-overlay-body';

export type ResponsiveOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  // The profile wizard cannot be dismissed: no close button, no Escape.
  locked?: boolean;
};

/** Open immediately, including on a first click before any other dialog was used. */
export function ResponsiveOverlay(props: ResponsiveOverlayProps) {
  const [loaded, setLoaded] = useState(props.open);
  if (props.open && !loaded) setLoaded(true);
  if (!props.open && !loaded) return null;

  // Keep the implementation mounted after closing for focus restoration and exit motion.
  return <OverlayBody {...props} />;
}
