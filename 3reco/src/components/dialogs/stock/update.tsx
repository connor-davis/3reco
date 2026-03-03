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
import { PencilIcon } from 'lucide-react';
import type { ReactElement } from 'react';
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
    .string({ error: 'Please provide a price.' })
    .regex(
      /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
      'Please provide a valid price that is a number or decimal, e.g. 10.5'
    )
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
    <Dialog>
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
          <DialogTitle>Edit Material</DialogTitle>
          <DialogDescription>
            Please fill out the fields below to edit an existing material.
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
                loading: 'Editing the material...',
                error: 'Failed to edit the material. Please try again.',
                success: () => {
                  materialForm.reset({});

                  return 'The material has been edited.';
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
                    Name
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-material-name"
                    aria-invalid={fieldState.invalid}
                    placeholder="Name"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please enter a name for the material.
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
                    Carbon Factor
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-material-carbon-factor"
                    aria-invalid={fieldState.invalid}
                    placeholder="Carbon Factor"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please enter a Carbon Factor for the material, e.g. 10.5
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
                    GW Code
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-material-gw-code"
                    aria-invalid={fieldState.invalid}
                    placeholder="GW Code"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please enter a GW Code for the material, e.g. GW 100
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
                    Price
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-material-price"
                    aria-invalid={fieldState.invalid}
                    placeholder="Price"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please enter a price for the material, e.g. 10.5
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>

          <Button type="submit">Edit Material</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
