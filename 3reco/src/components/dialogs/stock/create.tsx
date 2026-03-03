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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useConvexMutation,
  useConvexPaginatedQuery,
} from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

const stockSchema = z.object({
  materialId: z.string({ error: 'Please select a material.' }),
  weight: z
    .string({ error: 'Please enter a weight.' })
    .regex(
      /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
      'Please enter a valid weight that is a number or decimal, e.g. 10.5'
    ),
  price: z
    .string({ error: 'Please enter a price.' })
    .regex(
      /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
      'Please enter a valid price that is a number or decimal, e.g. 10.5'
    ),
});

export default function CreateStockDialog({
  children,
}: {
  children?: ReactElement;
}) {
  const { results: materials } = useConvexPaginatedQuery(
    api.materials.listWithPagination,
    {},
    { initialNumItems: 10 }
  );
  const createStock = useConvexMutation(api.stock.create);

  const stockForm = useForm<z.infer<typeof stockSchema>>({
    resolver: zodResolver(stockSchema),
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
          <DialogTitle>Create Stock</DialogTitle>
          <DialogDescription>
            Please fill out the fields below to create a new stock.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-create-material"
          className="flex flex-col w-full h-auto gap-3"
          onSubmit={stockForm.handleSubmit((values) =>
            toast.promise(
              createStock({
                materialId: values.materialId as Id<'materials'>,
                weight: values.weight,
                price: values.price,
              }),
              {
                loading: 'Creating the new material...',
                error: 'Failed to create the new material. Please try again.',
                success: () => {
                  stockForm.reset({});

                  return 'The new material has been created.';
                },
              }
            )
          )}
        >
          <FieldGroup className="gap-3">
            <Controller
              name="materialId"
              control={stockForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-stock-material">
                    Material
                  </FieldLabel>
                  <Select
                    id="form-create-stock-material"
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a material">
                        {
                          materials?.find(
                            (material) => material._id === field.value
                          )?.name
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Materials</SelectLabel>
                        {materials?.map((material) => (
                          <SelectItem key={material._id} value={material._id}>
                            {material.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please select the material for this stock.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="weight"
              control={stockForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-stock-weight">
                    Weight
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-stock-weight"
                    aria-invalid={fieldState.invalid}
                    placeholder="Weight"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please enter a weight for the stock, e.g. 10.5
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="price"
              control={stockForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-stock-price">
                    Price
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-stock-price"
                    aria-invalid={fieldState.invalid}
                    placeholder="Price"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please enter a price for the stock, e.g. 10.5
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>

          <Button type="submit">Create Stock</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
