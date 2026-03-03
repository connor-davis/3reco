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
import { useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

const materialSchema = z.object({
  name: z.string({ error: 'Please provide a material name.' }),
  carbonFactor: z
    .string({ error: 'Please provide a Carbon Factor.' })
    .regex(
      /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
      'Please provide a valid Carbon Factor that is a number or decimal, e.g. 10.5'
    ),
  gwCode: z
    .string({ error: 'Please provide a GW Code.' })
    .regex(
      /^GW\s*[+-]?(\d+(\.\d*)?|\.\d+)/,
      'Please provide a valid GW Code, e.g. GW 100'
    ),
});

export default function CreateMaterialDialog({
  children,
}: {
  children?: ReactElement;
}) {
  const createMaterial = useConvexMutation(api.materials.create);

  const materialForm = useForm<z.infer<typeof materialSchema>>({
    resolver: zodResolver(materialSchema),
  });

  return (
    <Dialog>
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
          <DialogTitle>Create Material</DialogTitle>
          <DialogDescription>
            Please fill out the fields below to create a new material.
          </DialogDescription>
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
              }),
              {
                loading: 'Creating the new material...',
                error: 'Failed to create the new material. Please try again.',
                success: () => {
                  materialForm.reset({});

                  return 'The new material has been created.';
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
                    Please enter a name for the new material.
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
                    Please enter a Carbon Factor for the new material, e.g. 10.5
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
                    Please enter a GW Code for the new material, e.g. GW 100
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>

          <Button type="submit">Create Material</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
