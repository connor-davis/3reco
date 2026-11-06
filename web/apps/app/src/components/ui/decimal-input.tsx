import * as React from 'react';

import { QuantityStepper } from '@/components/quantity-stepper';
import { Input } from '@/components/ui/input';
import type { CounterProps } from '@/lib/quantity';

type DecimalInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'inputMode' | 'type' | 'min' | 'max'
> & {
  // Set for an amount: the field gets minus and plus and Arrow keys.
  counter?: CounterProps;
  onValueChange?: (value: string) => void;
};

function DecimalInput({ counter, onValueChange, ...props }: DecimalInputProps) {
  if (counter) {
    // The counter reports through onValueChange, so the event handler is dropped.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { value, onChange, ...rest } = props;

    return (
      <QuantityStepper
        {...rest}
        {...counter}
        value={String(value ?? '')}
        onValueChange={onValueChange ?? (() => {})}
      />
    );
  }

  return <Input type="text" inputMode="decimal" {...props} />;
}

export { DecimalInput };
