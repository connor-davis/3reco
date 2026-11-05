import { lazy, Suspense, useState, type ReactNode } from 'react';

const OverlayBody = lazy(() => import('./responsive-overlay-body'));

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

/** Load the dialog and drawer implementations only when an overlay is first opened. */
export function ResponsiveOverlay(props: ResponsiveOverlayProps) {
  const [loaded, setLoaded] = useState(props.open);
  if (props.open && !loaded) setLoaded(true);
  if (!props.open && !loaded) return null;

  // Keep the implementation mounted after closing for focus restoration and exit motion.
  return (
    <Suspense fallback={null}>
      <OverlayBody {...props} />
    </Suspense>
  );
}
