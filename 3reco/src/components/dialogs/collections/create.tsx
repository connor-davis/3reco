import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
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
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { zodResolver } from '@hookform/resolvers/zod';
import { ConvexError } from 'convex/values';
import { CheckIcon, PlusIcon } from 'lucide-react';
import { type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

const collectionSchema = z.object({
  materialId: z.string({ error: 'Please select a material.' }),
  collectorId: z.string({ error: 'Please select a collector.' }),
  weight: z
    .number({
      error: 'Please provide a weight that is a number or decimal, e.g. 10.5',
    })
    .nonnegative({ error: 'Weight cannot be negative.' }),
  price: z
    .number({
      error: 'Please provide a price that is a number or decimal, e.g. 10.5',
    })
    .nonnegative({ error: 'Price cannot be negative.' }),
});

export default function CreateCollectionDialog({
  children,
}: {
  children?: ReactElement;
}) {
  const materials = useConvexQuery(api.materials.list, {});
  const collectors = useConvexQuery(api.users.listCollectors, {});

  const createCollection = useConvexMutation(
    api.transactions.collectorToBusinessSale
  );

  const collectionForm = useForm<z.infer<typeof collectionSchema>>({
    resolver: zodResolver(collectionSchema),
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
          <DialogTitle>Create Collection</DialogTitle>
          <DialogDescription>
            Please fill out the fields below to create a new collection.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-create-material"
          className="flex flex-col w-full h-auto gap-3"
          onSubmit={collectionForm.handleSubmit((values) =>
            toast.promise(
              createCollection({
                materialId: values.materialId as Id<'materials'>,
                collectorId: values.collectorId as Id<'users'>,
                weight: values.weight,
                price: values.price,
              }),
              {
                loading: 'Creating the new material...',
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
                  return 'The new collection has been created.';
                },
              }
            )
          )}
        >
          <FieldGroup className="gap-3">
            <Controller
              name="materialId"
              control={collectionForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-collection-material">
                    Material
                  </FieldLabel>
                  <Select
                    id="form-create-collection-material"
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a material">
                        {materials?.find((m) => m._id === field.value)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>
                          {materials && materials.length > 0
                            ? 'Materials'
                            : 'There are no materials'}
                        </SelectLabel>
                        {materials?.map((material) => (
                          <SelectItem
                            key={material._id}
                            value={material._id}
                            render={
                              <Item key={material._id}>
                                <ItemContent>
                                  <ItemTitle>{material.name}</ItemTitle>
                                  <ItemDescription>
                                    The material has a carbon factor of{' '}
                                    {material.carbonFactor} kg CO₂e per kg, a GW
                                    code of {material.gwCode}, and a price of $
                                    {material.price} per kg.
                                  </ItemDescription>
                                </ItemContent>
                                <ItemActions>
                                  {field.value === material._id && (
                                    <CheckIcon />
                                  )}
                                </ItemActions>
                              </Item>
                            }
                          />
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please select a Material for the new collection.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="collectorId"
              control={collectionForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-collection-collector">
                    Collector
                  </FieldLabel>
                  <Select
                    id="form-create-collection-material"
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a collector">
                        {collectors?.find((m) => m._id === field.value)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>
                          {collectors && collectors.length > 0
                            ? 'Collectors'
                            : 'There are no collectors'}
                        </SelectLabel>
                        {collectors?.map((collector) => (
                          <SelectItem
                            key={collector._id}
                            value={collector._id}
                            render={
                              <Item key={collector._id}>
                                <ItemMedia>
                                  <Avatar>
                                    <AvatarImage src={collector.image} />
                                    <AvatarFallback>
                                      {collector.firstName?.charAt(0) ??
                                        collector.email?.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                </ItemMedia>
                                <ItemContent>
                                  <ItemTitle>{collector.name}</ItemTitle>
                                  <ItemDescription>
                                    {collector.phone} | {collector.email}
                                  </ItemDescription>
                                </ItemContent>
                                <ItemActions>
                                  {field.value === collector._id && (
                                    <CheckIcon />
                                  )}
                                </ItemActions>
                              </Item>
                            }
                          />
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <FieldDescription>
                    Please select a Collector for the new collection.
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="weight"
              control={collectionForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-collection-weight">
                    Weight
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-collection-weight"
                    aria-invalid={fieldState.invalid}
                    placeholder="Weight"
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
                    Please enter a Weight for the new collection, e.g. 10.5
                  </FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="price"
              control={collectionForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-create-collection-price">
                    Price
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-create-collection-price"
                    aria-invalid={fieldState.invalid}
                    placeholder="Price"
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
                    Please enter a Price for the new collection, e.g. 10.5
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>

          <Button type="submit">Create Collection</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
