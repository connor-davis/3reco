import { useId } from 'react';
import { ChipGroup, ChoiceSelect } from '@/components/filters';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { categories } from '@/lib/data/materials';
import { cities } from '@/lib/data/stores';

export type MarketFilterValues = {
  query: string;
  city: string;
  sort: string;
  category: string;
  verifiedOnly: boolean;
};

export const defaultFilters: MarketFilterValues = {
  query: '',
  city: 'all',
  sort: 'recommended',
  category: 'all',
  verifiedOnly: false,
};

const cityOptions = [
  { value: 'all', label: 'All locations' },
  ...cities.map((city) => ({ value: city, label: city })),
];

const sortOptions = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price', label: 'Price: low to high' },
  { value: 'available', label: 'Most available' },
  { value: 'co2', label: 'Most CO₂ saved' },
];

const categoryOptions = [
  { value: 'all', label: 'All materials' },
  ...categories.map((category) => ({ value: category, label: category })),
];

type Props = {
  values: MarketFilterValues;
  onChange: (values: MarketFilterValues) => void;
};

/** Location, sort and "verified only". Used inline and inside the phone Drawer. */
export function SelectFilters({ values, onChange }: Props) {
  // One filter set sits inline and another in the phone Drawer, so ids must differ.
  const verifiedId = useId();

  return (
    <>
      <ChoiceSelect
        label="Location"
        value={values.city}
        options={cityOptions}
        onChange={(city) => onChange({ ...values, city })}
      />
      <ChoiceSelect
        label="Sort by"
        value={values.sort}
        options={sortOptions}
        onChange={(sort) => onChange({ ...values, sort })}
      />
      <Field orientation="horizontal" className="w-auto">
        <Checkbox
          id={verifiedId}
          checked={values.verifiedOnly}
          onCheckedChange={(checked) =>
            onChange({ ...values, verifiedOnly: Boolean(checked) })
          }
        />
        <FieldLabel htmlFor={verifiedId} className="font-normal">
          Verified only
        </FieldLabel>
      </Field>
    </>
  );
}

/** The category chips under the toolbar. */
export function CategoryChips({ values, onChange }: Props) {
  return (
    <ChipGroup
      label="Category"
      value={values.category}
      options={categoryOptions}
      onChange={(category) => onChange({ ...values, category })}
    />
  );
}
