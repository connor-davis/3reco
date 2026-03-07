import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { MenuIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export default function PageHeaderDrawer({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <MenuIcon className="size-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <DrawerTitle>{title}</DrawerTitle>
              {description && <DrawerDescription>{description}</DrawerDescription>}
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon-sm">
                <XIcon className="size-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <div className="flex flex-col gap-3 p-4">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
