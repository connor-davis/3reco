import { ChoiceSelect } from '@/components/filters';

export function MarketFilters({
  sort,
  onChange,
}: {
  sort: string;
  onChange: (sort: string) => void;
}) {
  return (
    <ChoiceSelect
      label="Sort this page"
      value={sort}
      onChange={onChange}
      options={[
        { value: 'newest', label: 'Newest first' },
        { value: 'price', label: 'Price: low to high' },
        { value: 'available', label: 'Most available' },
      ]}
    />
  );
}
