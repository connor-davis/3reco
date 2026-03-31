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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { zodResolver } from '@hookform/resolvers/zod';
import { ConvexError } from 'convex/values';
import { PencilIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

const materialSchema = z.object({
  name: z.string({ error: 'Please provide a material name.' }).optional(),
  carbonFactor: z
    .string({ error: 'Please provide a Carbon Factor.' })
    .regex(
      /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
      'Please provide a valid Carbon Factor that is a number or decimal, e.g. 10.5'
    )
    .optional(),
  gwCode: z
    .string({ error: 'Please provide a GW Code.' })
    .regex(
      /^GW\s*[+-]?(\d+(\.\d*)?|\.\d+)/,
      'Please provide a valid GW Code, e.g. GW 100'
    )
    .optional(),
  price: z
    .number({
      error: 'Please provide a price that is a number or decimal, e.g. 10.5',
    })
    .nonnegative({ error: 'Price cannot be negative.' })
    .optional(),
});

export default function EditMaterialByIdDialog({
  _id,
  children,
}: {
  children?: ReactElement;
  _id: Id<'materials'>;
}) {
  const existingMaterial = useConvexQuery(api.materials.findById, {
    _id,
  });

  const updateMaterial = useConvexMutation(api.materials.update);
  const [open, setOpen] = useState<boolean>(false);

  const materialForm = useForm<z.infer<typeof materialSchema>>({
    resolver: zodResolver(materialSchema),
    values: {
      name: existingMaterial?.name,
      carbonFactor: existingMaterial?.carbonFactor,
      gwCode: existingMaterial?.gwCode,
      price: existingMaterial?.price,
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
              <PencilIcon className="size-4" />
              <Label>Edit</Label>
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit material</DialogTitle>
          <DialogDescription>
            Update the main details for this material.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-create-material"
          className="flex flex-col w-full h-auto gap-3"
          onSubmit={materialForm.handleSubmit((values) =>
            toast.promise(
              updateMaterial({
                _id,
                name: values.name,
                carbonFactor: values.carbonFactor,
                gwCode: values.gwCode,
                price: values.price,
              }),
              {
                loading: 'Saving changes...',
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

                  return 'Material updated.';
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
                    Give this material a clear name.
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
                     Enter the carbon value, for example 10.5.
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
                     Use the waste code, for example GW 100.
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
                  <Input
                    {...field}
                    id="form-create-material-price"
                    aria-invalid={fieldState.invalid}
                    placeholder="Price per kg"
                    type="number"
                    step={0.01}
                    onChange={(event) =>
                      field.onChange(event.target.valueAsNumber)
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Enter the price per kg, for example 10.5.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>

           <Button type="submit">Save changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
