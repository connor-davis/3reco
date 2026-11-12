import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  // When set, the person must type this exact text before they can confirm.
  typedName?: string;
  // False for a safe yes (like verifying a business): the button is the plain
  // brand colour instead of red.
  destructive?: boolean;
};

/** The one confirm for every action that needs a second yes (remove, cancel, verify). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Keep it',
  onConfirm,
  typedName,
  destructive = true,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const blocked = typedName !== undefined && typed !== typedName;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped('');
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typedName !== undefined && (
          <Field>
            <FieldLabel htmlFor="typed-confirmation">
              Type {typedName} to confirm
            </FieldLabel>
            <Input
              id="typed-confirmation"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={blocked}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
