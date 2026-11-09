import { useId, type ComponentProps, type ReactNode } from 'react';
import {
  type Control,
  Controller,
  type ControllerFieldState,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { tidyName } from '@/lib/names';
import type { CounterProps } from '@/lib/quantity';
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
  // The error replaces the hint, so the two never say the same thing twice.
  const hint = state.invalid ? undefined : description;
  const describedBy =
    [hint && ids.hintId, state.invalid && ids.errorId]
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
      {hint && <FieldDescription id={ids.hintId}>{hint}</FieldDescription>}
      <FieldError id={ids.errorId} errors={[state.error]} />
    </Field>
  );
}

type TextFieldProps<T extends FieldValues> = FieldProps<T> &
  Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange' | 'onBlur'>;

/** `personName` fixes ALL CAPS or all lower case when the person leaves the field. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  personName,
  ...inputProps
}: TextFieldProps<T> & { personName?: boolean }) {
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
          {(aria) => (
            <Input
              {...field}
              {...aria}
              {...inputProps}
              onBlur={() => {
                if (personName) field.onChange(tidyName(field.value));
                field.onBlur();
              }}
            />
          )}
        </FieldFrame>
      )}
    />
  );
}

/**
 * Text field for exact decimals (money, kg). Never a number input. Pass
 * `counter` for an amount: it adds minus, plus and Arrow keys.
 */
export function DecimalField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  counter,
  ...inputProps
}: TextFieldProps<T> & { counter?: CounterProps }) {
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
          {(aria) => (
            <DecimalInput
              {...field}
              {...aria}
              {...inputProps}
              counter={counter}
              onValueChange={field.onChange}
            />
          )}
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
  onSearch,
}: SelectFieldProps<T> & { onSearch?: (text: string) => void }) {
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
              onInputValueChange={onSearch}
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
        <div className="space-y-2">
          <Field orientation="horizontal" data-invalid={fieldState.invalid}>
            <Checkbox
              id={id}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? errorId : undefined}
            />
            {/* One span, so the label's flex layout keeps the sentence whole. */}
            <FieldLabel htmlFor={id} className="font-normal">
              <span>{label}</span>
            </FieldLabel>
          </Field>
          {/* One line is always kept for the error, so the form never jumps. */}
          <div className="min-h-5">
            <FieldError id={errorId} errors={[fieldState.error]} />
          </div>
        </div>
      )}
    />
  );
}
