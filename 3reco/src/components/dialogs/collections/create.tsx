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
import { CheckIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { type ReactElement } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

const itemSchema = z.object({
  materialId: z.string({ error: 'Please select a material.' }),
  weight: z
    .number({ error: 'Please provide a weight.' })
    .positive({ error: 'Weight must be greater than zero.' }),
  price: z
    .number({ error: 'Please provide a price.' })
    .positive({ error: 'Price must be greater than zero.' }),
});

const collectionSchema = z.object({
  collectorId: z.string({ error: 'Please select a collector.' }),
  items: z.array(itemSchema).min(1, { error: 'At least one item is required.' }),
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

  const form = useForm<z.infer<typeof collectionSchema>>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      collectorId: '',
      items: [{ materialId: '', weight: 0, price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
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
      <DialogContent className="w-screen max-w-screen-sm flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Collection</DialogTitle>
          <DialogDescription>
            Select a collector and add one or more materials to record this
            collection.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-create-collection"
          className="flex flex-col w-full min-h-0 gap-4 flex-1"
          onSubmit={form.handleSubmit((values) =>
            toast.promise(
              createCollection({
                collectorId: values.collectorId as Id<'users'>,
                items: values.items.map((item) => ({
                  materialId: item.materialId as Id<'materials'>,
                  weight: item.weight,
                  price: item.price,
                })),
              }),
              {
                loading: 'Creating collection...',
                error: (error: Error) => {
                  if (error instanceof ConvexError) {
                    return {
                      message: error.data.name,
                      description: error.data.message,
                    };
                  }
                  return { message: error.name, description: error.message };
                },
                success: () => {
                  form.reset({
                    collectorId: '',
                    items: [{ materialId: '', weight: 0, price: 0 }],
                  });
                  return 'Collection created.';
                },
              }
            )
          )}
        >
          {/* Collector — fixed, doesn't scroll */}
          <div className="shrink-0">
          <Controller
            name="collectorId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-create-collection-collector">
                  Collector
                </FieldLabel>
                <Select
                  id="form-create-collection-collector"
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a collector">
                      {(() => {
                        const c = collectors?.find((m) => m._id === field.value);
                        return c ? (c.businessName ?? c.name ?? c.email) : undefined;
                      })()}
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
                                <ItemTitle>
                                  {collector.businessName ?? collector.name}
                                </ItemTitle>
                                <ItemDescription>
                                  {collector.phone} | {collector.email}
                                </ItemDescription>
                              </ItemContent>
                              <ItemActions>
                                {field.value === collector._id && <CheckIcon />}
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
              </Field>
            )}
          />
          </div>

          {/* Cart items — scrollable */}
          <div className="flex flex-col gap-3 min-h-0 flex-1 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <Label className="text-sm font-medium">Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ materialId: '', weight: 0, price: 0 })}
              >
                <PlusIcon className="size-3" />
                Add Item
              </Button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
            {fields.map((field, index) => (
              <FieldGroup
                key={field.id}
                className="gap-2 p-3 border rounded-lg"
              >
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-muted-foreground">
                    Item {index + 1}
                  </Label>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <TrashIcon className="size-3" />
                    </Button>
                  )}
                </div>

                <Controller
                  name={`items.${index}.materialId`}
                  control={form.control}
                  render={({ field: f, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Material</FieldLabel>
                      <Select
                        value={f.value}
                        onValueChange={(value) => f.onChange(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a material">
                            {materials?.find((m) => m._id === f.value)?.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>
                              {materials && materials.length > 0
                                ? 'Materials'
                                : 'No materials'}
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
                                        Base price: R{material.price}/kg
                                      </ItemDescription>
                                    </ItemContent>
                                    <ItemActions>
                                      {f.value === material._id && (
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
                    </Field>
                  )}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Controller
                    name={`items.${index}.weight`}
                    control={form.control}
                    render={({ field: f, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Weight (kg)</FieldLabel>
                        <Input
                          {...f}
                          type="number"
                          step={0.01}
                          placeholder="e.g. 10.5"
                          onChange={(e) => f.onChange(e.target.valueAsNumber)}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name={`items.${index}.price`}
                    control={form.control}
                    render={({ field: f, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Price / kg (R)</FieldLabel>
                        <Input
                          {...f}
                          type="number"
                          step={0.01}
                          placeholder="e.g. 5.00"
                          onChange={(e) => f.onChange(e.target.valueAsNumber)}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>
              </FieldGroup>
            ))}
            </div>
          </div>

          <Button type="submit" className="shrink-0">Create Collection</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
