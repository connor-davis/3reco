import type { ComponentProps, KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { atBound, stepDecimal, type CounterProps } from '@/lib/quantity';

type QuantityStepperProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  'value' | 'onChange' | 'type' | 'inputMode'
> &
  CounterProps & {
    value: string;
    onValueChange: (value: string) => void;
  };

/**
 * A decimal field with minus and plus. Typing stays a text field so decimals
 * are exact, and the arithmetic is on scaled integers, never floats.
 */
export function QuantityStepper({
  value,
  onValueChange,
  noun,
  unit,
  step,
  min,
  max,
  places,
  disabled,
  className,
  ...inputProps
}: QuantityStepperProps) {
  const bounds = { places, min, max };

  function nudge(direction: 1 | -1, big = false) {
    let next = value;

    // Shift is ten presses, each exact and clamped.
    for (let press = 0; press < (big ? 10 : 1); press++) {
      next = stepDecimal(next, step, direction, bounds);
    }

    onValueChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();
    nudge(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
  }

  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <IconButton
          label={`Decrease ${noun}`}
          size="icon-sm"
          type="button"
          disabled={disabled || atBound(value, -1, bounds)}
          onClick={() => nudge(-1)}
        >
          <Minus />
        </IconButton>
      </InputGroupAddon>
      <InputGroupInput
        {...inputProps}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 text-center tabular-nums"
      />
      <InputGroupAddon align="inline-end">
        {unit && <InputGroupText>{unit}</InputGroupText>}
        <IconButton
          label={`Increase ${noun}`}
          size="icon-sm"
          type="button"
          disabled={disabled || atBound(value, 1, bounds)}
          onClick={() => nudge(1)}
        >
          <Plus />
        </IconButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
