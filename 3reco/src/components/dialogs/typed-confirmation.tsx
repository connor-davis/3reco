import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function matchesTypedConfirmation(input: string, expectedValue: string) {
  return input.trim() === expectedValue.trim();
}

export function TypedConfirmationField({
  expectedValue,
  confirmationLabel,
  value,
  onChange,
}: {
  expectedValue: string;
  confirmationLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="typed-confirmation-input">
        Enter the {confirmationLabel} to confirm
      </Label>
      <Input
        id="typed-confirmation-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={expectedValue}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <p className="text-sm text-muted-foreground">
        Type <strong>{expectedValue}</strong> exactly to continue.
      </p>
    </div>
  );
}
