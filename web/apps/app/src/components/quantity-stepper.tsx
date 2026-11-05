import { Minus, Plus } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { toGrams } from '@/lib/format';

type QuantityStepperProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: number;
  invalid?: boolean;
  // The id of the FieldError that explains why the value is invalid.
  errorId?: string;
  id?: string;
  className?: string;
};

/** Weight in kg with minus and plus. Typing stays a text field so decimals are exact. */
export function QuantityStepper({
  label,
  value,
  onChange,
  step = 50,
  invalid = false,
  errorId,
  id,
  className,
}: QuantityStepperProps) {
  function nudge(direction: 1 | -1) {
    const next = Math.max(0, toGrams(value) + direction * step * 1000);
    onChange(String(next / 1000));
  }

  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <IconButton
          label={`Less ${label}`}
          size="icon-sm"
          type="button"
          onClick={() => nudge(-1)}
        >
          <Minus />
        </IconButton>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 text-center tabular-nums"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>kg</InputGroupText>
        <IconButton
          label={`More ${label}`}
          size="icon-sm"
          type="button"
          onClick={() => nudge(1)}
        >
          <Plus />
        </IconButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
