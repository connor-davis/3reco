import { useId, type ComponentProps, type ReactNode } from 'react';
import {
  type Control,
  Controller,
  type ControllerFieldState,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { DecimalInput } from '@/components/ui/decimal-input';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Option } from '@/components/filters';

// These wrap react-hook-form's Controller around the shadcn Field, so every
// form field has a label, a hint and an inline error in the same place. The
// control points at its hint and its error with aria-describedby.

type FieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
};

// Each field instance gets its own ids, so two forms on one screen (a wizard
// over a page, a filter sheet next to a filter bar) never share a label.
function useFieldIds() {
  const base = useId();

  return { id: base, hintId: `${base}-hint`, errorId: `${base}-error` };
}

type Ids = ReturnType<typeof useFieldIds>;

type ControlProps = {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
};

/** Label, control, hint and error laid out the same way for every field type. */
function FieldFrame({
  ids,
  label,
  description,
  state,
  children,
}: {
  ids: Ids;
  label: string;
  description?: string;
  state: ControllerFieldState;
  children: (props: ControlProps) => ReactNode;
}) {
  const describedBy =
    [description && ids.hintId, state.invalid && ids.errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field data-invalid={state.invalid}>
      <FieldLabel htmlFor={ids.id}>{label}</FieldLabel>
      {children({
        id: ids.id,
        'aria-invalid': state.invalid,
        'aria-describedby': describedBy,
      })}
      {description && (
        <FieldDescription id={ids.hintId}>{description}</FieldDescription>
      )}
      <FieldError id={ids.errorId} errors={[state.error]} />
    </Field>
  );
}

type TextFieldProps<T extends FieldValues> = FieldProps<T> &
  Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange' | 'onBlur'>;

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  ...inputProps
}: TextFieldProps<T>) {
  const ids = useFieldIds();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldFrame
          ids={ids}
          label={label}
          description={description}
          state={fieldState}
        >
          {(aria) => <Input {...field} {...aria} {...inputProps} />}
        </FieldFrame>
      )}
    />
  );
}

/** Text field for exact decimals (money, kg). Never a number input. */
export function DecimalField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  ...inputProps
}: TextFieldProps<T>) {
  const ids = useFieldIds();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldFrame
          ids={ids}
          label={label}
          description={description}
          state={fieldState}
        >
          {(aria) => <DecimalInput {...field} {...aria} {...inputProps} />}
        </FieldFrame>
      )}
    />
  );
}

type SelectFieldProps<T extends FieldValues> = FieldProps<T> & {
  options: (string | Option)[];
  placeholder?: string;
};

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
  placeholder = 'Choose one',
}: SelectFieldProps<T>) {
  const ids = useFieldIds();
  const items = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldFrame
          ids={ids}
          label={label}
          description={description}
          state={fieldState}
        >
          {(aria) => (
            <Select
              items={items}
              value={field.value || null}
              onValueChange={field.onChange}
            >
              <SelectTrigger className="w-full" {...aria}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldFrame>
      )}
    />
  );
}

/** A searchable pick-one list, for long lists such as collectors. */
export function ComboboxField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
  placeholder = 'Search…',
}: SelectFieldProps<T>) {
  const ids = useFieldIds();
  const items = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldFrame
          ids={ids}
          label={label}
          description={description}
          state={fieldState}
        >
          {(aria) => (
            <Combobox
              items={items}
              value={items.find((item) => item.value === field.value) ?? null}
              onValueChange={(item) => field.onChange(item?.value ?? '')}
            >
              <ComboboxInput placeholder={placeholder} {...aria} />
              <ComboboxContent>
                <ComboboxEmpty>No match.</ComboboxEmpty>
                <ComboboxList>
                  {(item: { value: string; label: string }) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}
        </FieldFrame>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  ...textareaProps
}: FieldProps<T> &
  Omit<ComponentProps<typeof Textarea>, 'name' | 'value' | 'onChange'>) {
  const ids = useFieldIds();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldFrame
          ids={ids}
          label={label}
          description={description}
          state={fieldState}
        >
          {(aria) => <Textarea {...field} {...aria} {...textareaProps} />}
        </FieldFrame>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({
  control,
  name,
  label,
}: Omit<FieldProps<T>, 'label'> & { label: ReactNode }) {
  const { id, errorId } = useFieldIds();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field orientation="horizontal" data-invalid={fieldState.invalid}>
          <Checkbox
            id={id}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? errorId : undefined}
          />
          <FieldLabel htmlFor={id} className="font-normal">
            {label}
          </FieldLabel>
          <FieldError id={errorId} errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}
