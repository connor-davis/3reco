import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ButtonRow } from '@/components/button-row';

import type { ResponsiveOverlayProps } from './responsive-overlay';

/**
 * A Dialog on desktop and a bottom Drawer on phones (map section 3). Every
 * form or list overlay in the app goes through this one wrapper.
 */
export default function ResponsiveOverlayBody({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide = false,
  locked = false,
}: ResponsiveOverlayProps) {
  const isMobile = useIsMobile();

  function handleChange(next: boolean) {
    if (!locked) onOpenChange(next);
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleChange} showSwipeHandle>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            {<DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-4 pb-2">{children}</div>
          {footer && (
            <DrawerFooter>
              <ButtonRow>{footer}</ButtonRow>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleChange}>
      <DialogContent
        showCloseButton={!locked}
        className={cn(
          'max-h-[90dvh] overflow-y-auto',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
