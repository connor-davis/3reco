import { Search } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

type SearchBoxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/** Search field. The label doubles as the placeholder and the accessible name. */
export function SearchBox({
  label,
  value,
  onChange,
  className,
}: SearchBoxProps) {
  return (
    // flex-1 grows the box along a toolbar row; max-h-11 stops it growing
    // tall when the parent is a column (the messages inbox).
    <InputGroup
      className={cn('max-h-11 min-w-36 flex-1 basis-36 sm:max-w-sm', className)}
    >
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  );
}

export type Option = { value: string; label: string };

type ChoiceSelectProps = {
  label: string;
  value: string;
  options: (string | Option)[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

function toOption(option: string | Option): Option {
  return typeof option === 'string' ? { value: option, label: option } : option;
}

/** A labelled single-choice dropdown built from the shadcn Select. */
export function ChoiceSelect({
  label,
  value,
  options,
  onChange,
  className,
  disabled,
}: ChoiceSelectProps) {
  const items = options.map(toOption);

  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        aria-label={label}
        className={cn('min-h-11 min-w-36 max-w-full shrink-0', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type ChipGroupProps = {
  label: string;
  // White chips with a hairline, for pages that sit on a tinted surface.
  outlined?: boolean;
  value: string;
  options: (string | Option)[];
  onChange: (value: string) => void;
};

/** Single-choice chips (categories, inbox filters). One is always active. */
export function ChipGroup({
  label,
  outlined = false,
  value,
  options,
  onChange,
}: ChipGroupProps) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="default"
      spacing={2}
      className="flex-wrap"
      value={[value]}
      onValueChange={(next) => next[0] && onChange(next[0])}
    >
      {options.map(toOption).map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          className={cn(
            'min-h-11 min-w-11 px-4 aria-pressed:bg-foreground aria-pressed:text-background',
            outlined ? 'border-border bg-card' : 'bg-muted'
          )}
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
