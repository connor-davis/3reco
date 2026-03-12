import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { MenuIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type PageHeaderActionsProps = {
  title?: string;
  description?: string;
  children: ReactNode;
};

function PageHeaderActionsTrigger() {
  return (
    <Button variant="ghost" size="icon-sm">
      <MenuIcon className="size-4" />
      <span className="sr-only">Open page actions</span>
    </Button>
  );
}

function PageHeaderActionsPanel({
  title,
  description,
  children,
}: Required<Pick<PageHeaderActionsProps, 'title'>> &
  Pick<PageHeaderActionsProps, 'description' | 'children'>) {
  return (
    <>
      <PopoverHeader className="border-b px-4 py-3">
        <PopoverTitle>{title}</PopoverTitle>
        {description && <PopoverDescription>{description}</PopoverDescription>}
      </PopoverHeader>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </>
  );
}

export default function PageHeaderActions({
  title = 'Actions',
  description,
  children,
}: PageHeaderActionsProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger>
          <PageHeaderActionsTrigger />
        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-[min(24rem,calc(100vw-1rem))] max-w-none p-0"
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {children}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger>
        <PageHeaderActionsTrigger />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1rem))] max-w-none p-0"
      >
        <PageHeaderActionsPanel
          title={title}
          description={description}
        >
          {children}
        </PageHeaderActionsPanel>
      </PopoverContent>
    </Popover>
  );
}
