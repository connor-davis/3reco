import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DecimalInput,
} from '@/components/ui/decimal-input';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { ConvexError } from 'convex/values';
import { PlusIcon } from 'lucide-react';
import { createMaterialSchema } from '@/lib/material-form-schema';
import { useState, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

type CreateMaterialFormInput = {
  name: string;
  carbonFactor: string;
  gwCode: string;
  price: string;
};
type CreateMaterialFormValues = z.output<typeof createMaterialSchema>;

export default function CreateMaterialDialog({
  children,
}: {
  children?: ReactElement;
}) {
  const createMaterial = useConvexMutation(api.materials.create);
  const [open, setOpen] = useState<boolean>(false);

  const materialForm = useForm<
    CreateMaterialFormInput,
    unknown,
    CreateMaterialFormValues
  >({
    resolver: zodResolver<
      CreateMaterialFormInput,
      unknown,
      CreateMaterialFormValues
    >(createMaterialSchema),
    defaultValues: {
      name: '',
      carbonFactor: '',
      gwCode: '',
      price: '',
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          children ? (
            children
          ) : (
            <Button variant="ghost">
              <PlusIcon className="size-4" />
              <Label>Create</Label>
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>Add a material.</DialogDescription>
        </DialogHeader>

        <form
          id="form-create-material"
          className="flex flex-col w-full h-auto gap-3"
          onSubmit={materialForm.handleSubmit((values) =>
            toast.promise(
              createMaterial({
                name: values.name,
                carbonFactor: values.carbonFactor,
                gwCode: values.gwCode,
                price: values.price,
              }),
              {
                loading: 'Adding material...',
                error: (error: Error) => {
                  if (error instanceof ConvexError) {
                    return {
                      message: error.data.name,
                      description: error.data.message,
                    };
                  }

                  return {
                    message: error.name,
                    description: error.message,
                  };
                },
                success: () => {
                  materialForm.reset({});
                  setOpen(false);

                  return 'Material added.';
                },
              }
            )
          )}
        >
          <FieldGroup className="gap-3">
            <Controller
              name="name"
              control={materialForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-material-name">
                    Material name
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-material-name"
                    aria-invalid={fieldState.invalid}
                    placeholder="Material name"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Use a clear name people will recognise.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="carbonFactor"
              control={materialForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-material-carbon-factor">
                     Carbon footprint
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-material-carbon-factor"
                    aria-invalid={fieldState.invalid}
                     placeholder="Carbon footprint"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Enter the carbon value per kilogram, for example 10.5.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="gwCode"
              control={materialForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-material-gw-code">
                     Waste code
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-material-gw-code"
                    aria-invalid={fieldState.invalid}
                     placeholder="Waste code"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Use any waste code that ends in at least 3 numbers, like GW
                    100 or ABC-123.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="price"
              control={materialForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-material-price">
                    Price per kg
                  </FieldLabel>
                  <DecimalInput
                    {...field}
                    value={field.value ?? ''}
                    id="form-create-material-price"
                    aria-invalid={fieldState.invalid}
                    placeholder="Price per kg"
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Enter the price per kilogram, for example 12.50 or 12,50.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>

           <Button type="submit">Add material</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
